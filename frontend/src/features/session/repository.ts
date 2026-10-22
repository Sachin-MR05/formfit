/**
 * Local-first storage for profiles, sessions and reps. Everything is saved on the user's device first; the sync engine
 * (features/sync) replicates it to the account.
 *
 * All behaviour (versions, tombstones, pending changes, last-writer-wins merging) lives in `TableRepository` and is
 * tested with in-memory tables. IndexedDB only supplies the simple table primitives.
 */
import type { RepLabel, StoredProfile, StoredRep, StoredSession } from './types.ts';

export const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

// ----------------------------------------------------------------------------- contract
export interface Acked {
  id: string;
  /** the `updatedAt` that was pushed (so a record edited meanwhile is not wrongly marked as synced) */
  version: number;
}

export interface PendingChanges {
  profiles: StoredProfile[];
  /** includes tombstones: sessions with `deleted: true` */
  sessions: StoredSession[];
  reps: StoredRep[];
}

/** What a pull delivers. A remote session may be a tombstone. */
export interface RemoteBatch {
  profiles: StoredProfile[];
  sessions: Array<StoredSession | { id: string; deleted: true; updatedAt: number }>;
  reps: StoredRep[];
}

export interface ApplyResult {
  sessions: number;
  reps: number;
  deleted: number;
  profileChanged: boolean;
  /** reps whose session is not on this device yet: the caller must NOT advance its cursor past them */
  unknownSession: number;
}

export interface SessionRepository {
  saveProfile(p: StoredProfile): Promise<void>;
  loadProfile(): Promise<StoredProfile | null>;
  clearProfile(): Promise<void>;

  createSession(s: StoredSession): Promise<void>;
  updateSession(id: string, patch: Partial<Omit<StoredSession, 'id' | 'updatedAt' | 'syncedVersion'>>): Promise<void>;
  addRep(r: StoredRep): Promise<void>;
  setRepLabel(repId: string, label: RepLabel): Promise<void>;

  /** newest first; deleted sessions are never listed */
  listSessions(): Promise<StoredSession[]>;
  listReps(sessionId: string): Promise<StoredRep[]>;
  listAllReps(): Promise<StoredRep[]>;
  /** removes the session and its reps; if the account already has it, a tombstone is kept until the server confirms */
  deleteSession(id: string): Promise<void>;
  /** wipes everything on this device (data, profile, sync bookkeeping) */
  clearAll(): Promise<void>;

  // ---- sync support
  listPending(): Promise<PendingChanges>;
  markSynced(acks: { profiles: Acked[]; sessions: Acked[]; reps: Acked[] }): Promise<void>;
  applyRemote(batch: RemoteBatch): Promise<ApplyResult>;
  /** hard delete without tombstone (the server told us it is gone) */
  removeSessionLocally(id: string): Promise<void>;
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string | null): Promise<void>;
}

// ----------------------------------------------------------------------------- storage primitives
export interface Table<T extends { id: string }> {
  get(id: string): Promise<T | undefined>;
  put(row: T): Promise<void>;
  delete(id: string): Promise<void>;
  all(): Promise<T[]>;
  clear(): Promise<void>;
}

export interface RepsTable extends Table<StoredRep> {
  bySession(sessionId: string): Promise<StoredRep[]>;
}

export interface KvTable {
  get(key: string): Promise<unknown | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

const PROFILE_KEY = 'profile';
const META_PREFIX = 'meta:';

// Older versions stored records without sync fields: treat them as "never synced".
function normSession(s: StoredSession): StoredSession {
  return { ...s, updatedAt: s.updatedAt ?? s.startedAt, syncedVersion: s.syncedVersion ?? null };
}
function normRep(r: StoredRep): StoredRep {
  return { ...r, updatedAt: r.updatedAt ?? r.createdAt, syncedVersion: r.syncedVersion ?? null };
}
function normProfile(p: StoredProfile): StoredProfile {
  return { ...p, id: p.id ?? newId(), updatedAt: p.updatedAt ?? p.createdAt, syncedVersion: p.syncedVersion ?? null };
}

const isPending = (r: { updatedAt: number; syncedVersion: number | null }): boolean => r.syncedVersion !== r.updatedAt;

export class TableRepository implements SessionRepository {
  constructor(
    private readonly sessions: Table<StoredSession>,
    private readonly reps: RepsTable,
    private readonly kv: KvTable,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** A strictly newer version than the current one, even within the same millisecond. */
  private next(current: number): number {
    return Math.max(this.now(), current + 1);
  }

  // ------------------------------------------------------------------ profile
  async saveProfile(p: StoredProfile): Promise<void> {
    await this.kv.set(PROFILE_KEY, p);
  }
  async loadProfile(): Promise<StoredProfile | null> {
    const p = (await this.kv.get(PROFILE_KEY)) as StoredProfile | undefined;
    return p ? normProfile(p) : null;
  }
  async clearProfile(): Promise<void> {
    await this.kv.delete(PROFILE_KEY);
  }

  // ------------------------------------------------------------------ sessions and reps
  async createSession(s: StoredSession): Promise<void> {
    await this.sessions.put(s);
  }

  async updateSession(id: string, patch: Partial<Omit<StoredSession, 'id' | 'updatedAt' | 'syncedVersion'>>): Promise<void> {
    const cur = await this.sessions.get(id);
    if (!cur) throw new Error(`session ${id} not found`);
    const n = normSession(cur);
    await this.sessions.put({ ...n, ...patch, updatedAt: this.next(n.updatedAt) });
  }

  async addRep(r: StoredRep): Promise<void> {
    await this.reps.put(r);
  }

  async setRepLabel(repId: string, label: RepLabel): Promise<void> {
    const cur = await this.reps.get(repId);
    if (!cur) throw new Error(`rep ${repId} not found`);
    const n = normRep(cur);
    await this.reps.put({ ...n, label, updatedAt: this.next(n.updatedAt) });
  }

  async listSessions(): Promise<StoredSession[]> {
    return (await this.sessions.all()).map(normSession).filter((s) => !s.deleted).sort((a, b) => b.startedAt - a.startedAt);
  }
  async listReps(sessionId: string): Promise<StoredRep[]> {
    return (await this.reps.bySession(sessionId)).map(normRep).sort((a, b) => a.index - b.index);
  }
  async listAllReps(): Promise<StoredRep[]> {
    return (await this.reps.all()).map(normRep).sort((a, b) => a.createdAt - b.createdAt);
  }

  private async deleteRepsOf(sessionId: string): Promise<void> {
    for (const r of await this.reps.bySession(sessionId)) await this.reps.delete(r.id);
  }

  async deleteSession(id: string): Promise<void> {
    const cur = await this.sessions.get(id);
    if (!cur) return;
    const s = normSession(cur);
    await this.deleteRepsOf(id);
    if (s.syncedVersion !== null) {
      // the account knows this session: remember the deletion until the server confirms it
      await this.sessions.put({ ...s, deleted: true, fileName: null, updatedAt: this.next(s.updatedAt), syncedVersion: s.syncedVersion });
    } else {
      await this.sessions.delete(id); // never left this device: nothing to tell the server
    }
  }

  async removeSessionLocally(id: string): Promise<void> {
    await this.deleteRepsOf(id);
    await this.sessions.delete(id);
  }

  async clearAll(): Promise<void> {
    await Promise.all([this.sessions.clear(), this.reps.clear(), this.kv.clear()]);
  }

  // ------------------------------------------------------------------ sync
  async listPending(): Promise<PendingChanges> {
    const profile = await this.loadProfile();
    return {
      profiles: profile && isPending(profile) ? [profile] : [],
      sessions: (await this.sessions.all()).map(normSession).filter(isPending),
      reps: (await this.reps.all()).map(normRep).filter(isPending),
    };
  }

  async markSynced(acks: { profiles: Acked[]; sessions: Acked[]; reps: Acked[] }): Promise<void> {
    const profile = await this.loadProfile();
    for (const a of acks.profiles) {
      if (profile && profile.id === a.id && profile.updatedAt === a.version) await this.saveProfile({ ...profile, syncedVersion: a.version });
    }
    for (const a of acks.sessions) {
      const cur = await this.sessions.get(a.id);
      if (!cur) continue;
      const s = normSession(cur);
      if (s.updatedAt !== a.version) continue; // changed again while the push was in flight: stays pending
      if (s.deleted) await this.sessions.delete(a.id); // server confirmed the deletion: the tombstone has done its job
      else await this.sessions.put({ ...s, syncedVersion: a.version });
    }
    for (const a of acks.reps) {
      const cur = await this.reps.get(a.id);
      if (!cur) continue;
      const r = normRep(cur);
      if (r.updatedAt === a.version) await this.reps.put({ ...r, syncedVersion: a.version });
    }
  }

  async applyRemote(batch: RemoteBatch): Promise<ApplyResult> {
    const out: ApplyResult = { sessions: 0, reps: 0, deleted: 0, profileChanged: false, unknownSession: 0 };

    // profile: the newest calibration (by creation time) becomes the current one
    const local = await this.loadProfile();
    const newest = [...batch.profiles].sort((a, b) => b.createdAt - a.createdAt)[0];
    if (newest) {
      if (!local || newest.createdAt > local.createdAt) {
        await this.saveProfile({ ...newest, syncedVersion: newest.updatedAt });
        out.profileChanged = true;
      } else if (local.id === newest.id && newest.updatedAt > local.updatedAt) {
        await this.saveProfile({ ...newest, syncedVersion: newest.updatedAt });
        out.profileChanged = true;
      }
    }

    for (const rs of batch.sessions) {
      if ('deleted' in rs && rs.deleted) {
        if (await this.sessions.get(rs.id)) {
          await this.removeSessionLocally(rs.id); // a deletion made on another device always wins
          out.deleted += 1;
        }
        continue;
      }
      const incoming = rs as StoredSession;
      const cur = await this.sessions.get(incoming.id);
      const n = cur ? normSession(cur) : null;
      if (n?.deleted) continue; // we deleted it ourselves; our tombstone is on its way
      if (n && n.updatedAt > incoming.updatedAt) continue; // our version is newer: it will be pushed
      await this.sessions.put({ ...incoming, syncedVersion: incoming.updatedAt });
      out.sessions += 1;
    }

    for (const incoming of batch.reps) {
      const session = await this.sessions.get(incoming.sessionId);
      if (!session) {
        out.unknownSession += 1;
        continue;
      }
      if (normSession(session).deleted) continue; // we deleted that session ourselves
      const cur = await this.reps.get(incoming.id);
      if (cur && normRep(cur).updatedAt > incoming.updatedAt) continue;
      await this.reps.put({ ...incoming, syncedVersion: incoming.updatedAt });
      out.reps += 1;
    }
    return out;
  }

  async getMeta(key: string): Promise<string | null> {
    const v = await this.kv.get(META_PREFIX + key);
    return typeof v === 'string' ? v : null;
  }
  async setMeta(key: string, value: string | null): Promise<void> {
    if (value === null) await this.kv.delete(META_PREFIX + key);
    else await this.kv.set(META_PREFIX + key, value);
  }
}

// ----------------------------------------------------------------------------- in-memory tables (tests, private-mode fallback)
class MemTable<T extends { id: string }> implements Table<T> {
  protected rows = new Map<string, T>();
  async get(id: string) {
    const r = this.rows.get(id);
    return r ? structuredClone(r) : undefined;
  }
  async put(row: T) {
    this.rows.set(row.id, structuredClone(row));
  }
  async delete(id: string) {
    this.rows.delete(id);
  }
  async all() {
    return [...this.rows.values()].map((r) => structuredClone(r));
  }
  async clear() {
    this.rows.clear();
  }
}

class MemRepsTable extends MemTable<StoredRep> implements RepsTable {
  async bySession(sessionId: string) {
    return [...this.rows.values()].filter((r) => r.sessionId === sessionId).map((r) => structuredClone(r));
  }
}

class MemKv implements KvTable {
  private rows = new Map<string, unknown>();
  async get(key: string) {
    const v = this.rows.get(key);
    return v === undefined ? undefined : structuredClone(v);
  }
  async set(key: string, value: unknown) {
    this.rows.set(key, structuredClone(value));
  }
  async delete(key: string) {
    this.rows.delete(key);
  }
  async clear() {
    this.rows.clear();
  }
}

export class MemoryRepository extends TableRepository {
  constructor(now: () => number = () => Date.now()) {
    super(new MemTable<StoredSession>(), new MemRepsTable(), new MemKv(), now);
  }
}

// ----------------------------------------------------------------------------- IndexedDB tables (browser)
const DB_NAME = 'formfit';
const DB_VERSION = 1;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('IndexedDB request failed'));
  });
}
function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

class IdbDatabase {
  private promise: Promise<IDBDatabase> | null = null;
  get(): Promise<IDBDatabase> {
    if (!this.promise) {
      this.promise = new Promise((resolve, reject) => {
        const open = indexedDB.open(DB_NAME, DB_VERSION);
        open.onupgradeneeded = () => {
          const db = open.result;
          db.createObjectStore('kv', { keyPath: 'key' });
          db.createObjectStore('sessions', { keyPath: 'id' });
          db.createObjectStore('reps', { keyPath: 'id' }).createIndex('sessionId', 'sessionId');
        };
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error ?? new Error('Could not open IndexedDB'));
      });
    }
    return this.promise;
  }
}

class IdbTable<T extends { id: string }> implements Table<T> {
  constructor(protected readonly db: IdbDatabase, protected readonly name: 'sessions' | 'reps') {}
  protected async store(mode: IDBTransactionMode) {
    const tx = (await this.db.get()).transaction(this.name, mode);
    return { tx, store: tx.objectStore(this.name) };
  }
  async get(id: string) {
    const { store } = await this.store('readonly');
    return (await req(store.get(id))) as T | undefined;
  }
  async put(row: T) {
    const { tx, store } = await this.store('readwrite');
    store.put(row);
    await txDone(tx);
  }
  async delete(id: string) {
    const { tx, store } = await this.store('readwrite');
    store.delete(id);
    await txDone(tx);
  }
  async all() {
    const { store } = await this.store('readonly');
    return (await req(store.getAll())) as T[];
  }
  async clear() {
    const { tx, store } = await this.store('readwrite');
    store.clear();
    await txDone(tx);
  }
}

class IdbRepsTable extends IdbTable<StoredRep> implements RepsTable {
  constructor(db: IdbDatabase) {
    super(db, 'reps');
  }
  async bySession(sessionId: string) {
    const { store } = await this.store('readonly');
    return (await req(store.index('sessionId').getAll(sessionId))) as StoredRep[];
  }
}

class IdbKv implements KvTable {
  constructor(private readonly db: IdbDatabase) {}
  private async store(mode: IDBTransactionMode) {
    const tx = (await this.db.get()).transaction('kv', mode);
    return { tx, store: tx.objectStore('kv') };
  }
  async get(key: string) {
    const { store } = await this.store('readonly');
    const row = (await req(store.get(key))) as { key: string; value: unknown } | undefined;
    return row?.value;
  }
  async set(key: string, value: unknown) {
    const { tx, store } = await this.store('readwrite');
    store.put({ key, value });
    await txDone(tx);
  }
  async delete(key: string) {
    const { tx, store } = await this.store('readwrite');
    store.delete(key);
    await txDone(tx);
  }
  async clear() {
    const { tx, store } = await this.store('readwrite');
    store.clear();
    await txDone(tx);
  }
}

export class IndexedDbRepository extends TableRepository {
  constructor(now: () => number = () => Date.now()) {
    const db = new IdbDatabase();
    super(new IdbTable<StoredSession>(db, 'sessions'), new IdbRepsTable(db), new IdbKv(db), now);
  }
}

/** IndexedDB if the browser allows it (it can be blocked in some private modes), otherwise memory. */
export function createDefaultRepository(): SessionRepository {
  return typeof indexedDB !== 'undefined' ? new IndexedDbRepository() : new MemoryRepository();
}

// ----------------------------------------------------------------------------- CSV export (feeds ml/scripts/export_for_frontend.py --csv)
export const CSV_COLUMNS = [
  'person_id', 'rep_id', 'knee', 'hip', 'torso', 'shank', 'phi', 'femur_torso', 'shank_femur', 'leg_torso', 'label',
] as const;

/**
 * Labelled reps only (label good=1, faulty=0). `person_id` is the profile owner label you choose, so reps from
 * the same person stay together when the Python trainer splits train/test by person.
 */
export function repsToCsv(reps: readonly StoredRep[], personId: string): string {
  const rows = reps
    .filter((r) => r.label !== null)
    .map((r) =>
      [
        personId,
        r.index,
        r.features.knee,
        r.features.hip,
        r.features.torso,
        r.features.shank,
        r.features.phi,
        r.profile.femurTorso,
        r.profile.shankFemur,
        r.profile.legTorso,
        r.label === 'good' ? 1 : 0,
      ]
        .map((v, i) => (i >= 2 && i <= 9 ? (v as number).toFixed(4) : String(v)))
        .join(','),
    );
  return [CSV_COLUMNS.join(','), ...rows].join('\n');
}
