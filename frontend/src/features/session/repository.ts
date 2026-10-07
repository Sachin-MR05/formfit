/**
 * Local-first storage for profiles, sessions and reps. Everything is saved on the user's device first;
 * Phase 4 adds syncing the same records to the backend.
 */
import type { RepLabel, StoredProfile, StoredRep, StoredSession } from './types.ts';

export interface SessionRepository {
  saveProfile(p: StoredProfile): Promise<void>;
  loadProfile(): Promise<StoredProfile | null>;
  clearProfile(): Promise<void>;

  createSession(s: StoredSession): Promise<void>;
  updateSession(id: string, patch: Partial<StoredSession>): Promise<void>;
  addRep(r: StoredRep): Promise<void>;
  setRepLabel(repId: string, label: RepLabel): Promise<void>;

  /** newest first */
  listSessions(): Promise<StoredSession[]>;
  listReps(sessionId: string): Promise<StoredRep[]>;
  listAllReps(): Promise<StoredRep[]>;
  deleteSession(id: string): Promise<void>;
  clearAll(): Promise<void>;
}

export const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

// ----------------------------------------------------------------------------- in-memory (tests, private mode fallback)
export class MemoryRepository implements SessionRepository {
  private profile: StoredProfile | null = null;
  private sessions = new Map<string, StoredSession>();
  private reps = new Map<string, StoredRep>();

  async saveProfile(p: StoredProfile) {
    this.profile = structuredClone(p);
  }
  async loadProfile() {
    return this.profile ? structuredClone(this.profile) : null;
  }
  async clearProfile() {
    this.profile = null;
  }
  async createSession(s: StoredSession) {
    this.sessions.set(s.id, structuredClone(s));
  }
  async updateSession(id: string, patch: Partial<StoredSession>) {
    const cur = this.sessions.get(id);
    if (!cur) throw new Error(`session ${id} not found`);
    this.sessions.set(id, { ...cur, ...structuredClone(patch) });
  }
  async addRep(r: StoredRep) {
    this.reps.set(r.id, structuredClone(r));
  }
  async setRepLabel(repId: string, label: RepLabel) {
    const cur = this.reps.get(repId);
    if (!cur) throw new Error(`rep ${repId} not found`);
    this.reps.set(repId, { ...cur, label });
  }
  async listSessions() {
    return [...this.sessions.values()].sort((a, b) => b.startedAt - a.startedAt).map((s) => structuredClone(s));
  }
  async listReps(sessionId: string) {
    return [...this.reps.values()].filter((r) => r.sessionId === sessionId).sort((a, b) => a.index - b.index).map((r) => structuredClone(r));
  }
  async listAllReps() {
    return [...this.reps.values()].sort((a, b) => a.createdAt - b.createdAt).map((r) => structuredClone(r));
  }
  async deleteSession(id: string) {
    this.sessions.delete(id);
    for (const [rid, r] of this.reps) if (r.sessionId === id) this.reps.delete(rid);
  }
  async clearAll() {
    this.profile = null;
    this.sessions.clear();
    this.reps.clear();
  }
}

// ----------------------------------------------------------------------------- IndexedDB (browser)
const DB_NAME = 'formfit';
const DB_VERSION = 1;
const PROFILE_KEY = 'profile';

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

export class IndexedDbRepository implements SessionRepository {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private db(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
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
    return this.dbPromise;
  }

  private async store(name: 'kv' | 'sessions' | 'reps', mode: IDBTransactionMode = 'readonly') {
    const db = await this.db();
    const tx = db.transaction(name, mode);
    return { tx, store: tx.objectStore(name) };
  }

  private async put(name: 'kv' | 'sessions' | 'reps', value: unknown): Promise<void> {
    const { tx, store } = await this.store(name, 'readwrite');
    store.put(value);
    await txDone(tx);
  }

  async saveProfile(p: StoredProfile) {
    await this.put('kv', { key: PROFILE_KEY, value: p });
  }
  async loadProfile() {
    const { store } = await this.store('kv');
    const row = (await req(store.get(PROFILE_KEY))) as { value: StoredProfile } | undefined;
    return row?.value ?? null;
  }
  async clearProfile() {
    const { tx, store } = await this.store('kv', 'readwrite');
    store.delete(PROFILE_KEY);
    await txDone(tx);
  }
  async createSession(s: StoredSession) {
    await this.put('sessions', s);
  }
  async updateSession(id: string, patch: Partial<StoredSession>) {
    const { tx, store } = await this.store('sessions', 'readwrite');
    const cur = (await req(store.get(id))) as StoredSession | undefined;
    if (!cur) throw new Error(`session ${id} not found`);
    store.put({ ...cur, ...patch });
    await txDone(tx);
  }
  async addRep(r: StoredRep) {
    await this.put('reps', r);
  }
  async setRepLabel(repId: string, label: RepLabel) {
    const { tx, store } = await this.store('reps', 'readwrite');
    const cur = (await req(store.get(repId))) as StoredRep | undefined;
    if (!cur) throw new Error(`rep ${repId} not found`);
    store.put({ ...cur, label });
    await txDone(tx);
  }
  async listSessions() {
    const { store } = await this.store('sessions');
    const all = (await req(store.getAll())) as StoredSession[];
    return all.sort((a, b) => b.startedAt - a.startedAt);
  }
  async listReps(sessionId: string) {
    const { store } = await this.store('reps');
    const all = (await req(store.index('sessionId').getAll(sessionId))) as StoredRep[];
    return all.sort((a, b) => a.index - b.index);
  }
  async listAllReps() {
    const { store } = await this.store('reps');
    const all = (await req(store.getAll())) as StoredRep[];
    return all.sort((a, b) => a.createdAt - b.createdAt);
  }
  async deleteSession(id: string) {
    const db = await this.db();
    const tx = db.transaction(['sessions', 'reps'], 'readwrite');
    tx.objectStore('sessions').delete(id);
    const repsStore = tx.objectStore('reps');
    const keys = (await req(repsStore.index('sessionId').getAllKeys(id))) as IDBValidKey[];
    keys.forEach((k) => repsStore.delete(k));
    await txDone(tx);
  }
  async clearAll() {
    const db = await this.db();
    const tx = db.transaction(['kv', 'sessions', 'reps'], 'readwrite');
    (['kv', 'sessions', 'reps'] as const).forEach((n) => tx.objectStore(n).clear());
    await txDone(tx);
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
