/**
 * SyncEngine: replicates the local database with the account, both ways, safely.
 *
 *  - Local-first: coaching never waits for the network. Sync runs in the background.
 *  - Push sends what changed locally (sessions before reps, in batches). It is idempotent, so a retry after a
 *    failure never duplicates anything.
 *  - Pull applies what other devices changed. Sessions are fully drained before reps, and a cursor never moves past a
 *    rep whose session is missing, so nothing is lost.
 *  - An account switch on a shared device wipes the previous account's local data before syncing.
 */
import { createStore } from 'zustand/vanilla';
import type { Acked, ApplyResult, PendingChanges, RemoteBatch, SessionRepository } from '../session/repository.ts';
import type { StoredRep, StoredSession } from '../session/types.ts';
import { ApiError } from './api.ts';
import type { AuthManager } from './auth.ts';
import { profileFromWire, profileToWire, repFromWire, repToWire, sessionFromWire, sessionToWire } from './mapping.ts';
import type { Cursors, PullResult, PushOutcome, SyncApi } from './types.ts';

export type SyncPhase = 'disabled' | 'signed_out' | 'idle' | 'syncing' | 'offline' | 'error';

export interface SyncState {
  phase: SyncPhase;
  /** records waiting to be uploaded */
  pending: number;
  lastSyncedAt: number | null;
  error: string | null;
  /** set when the previous account's local data was removed because a different account signed in */
  switchedAccount: boolean;
}

export interface SyncDeps {
  api: SyncApi;
  auth: Pick<AuthManager, 'store' | 'handleUnauthorized'>;
  repo: SessionRepository;
  now: () => number;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  /** remote data arrived (e.g. a body profile from another device) */
  onRemoteApplied?: (result: ApplyResult) => void;
  /** local data was wiped because another account signed in */
  onLocalDataReset?: () => void;
}

export const BATCH_PROFILES = 20;
export const BATCH_SESSIONS = 100;
export const BATCH_REPS = 500;
const PAGE = 500;
const OWNER_KEY = 'owner';
const CURSOR_KEY = 'cursors';
/** Re-read this much recent history on every sync: it costs nothing (merging is idempotent) and covers commit-order races. */
const CURSOR_OVERLAP_MS = 5000;
const MAX_PAGES = 200;

const EMPTY_CURSORS: Cursors = { profiles: '0:', sessions: '0:', reps: '0:' };

/** "<ms>:<id>" -> "<ms - overlap>:" */
export function withOverlap(cursor: string, overlapMs = CURSOR_OVERLAP_MS): string {
  const ms = Number(cursor.split(':')[0]);
  return Number.isFinite(ms) ? `${Math.max(0, ms - overlapMs)}:` : '0:';
}

export class SyncEngine {
  readonly store = createStore<SyncState>()(() => ({ phase: 'signed_out', pending: 0, lastSyncedAt: null, error: null, switchedAccount: false }));
  private running = false;
  private rerun = false;
  private timer: unknown = null;
  private failures = 0;
  private unsubscribeAuth: (() => void) | null = null;
  /** ids the server refused for good (id_conflict): never retried in this session, never block the rest */
  private readonly refused = new Set<string>();

  constructor(private readonly deps: SyncDeps) {}

  private set(patch: Partial<SyncState>): void {
    this.store.setState(patch);
  }

  /** React to sign-in / sign-out. */
  start(): void {
    const apply = (status: string, userId: string | null) => {
      if (!this.deps.api.enabled) return this.set({ phase: 'disabled' });
      if (status === 'signed_in' && userId) {
        void this.adoptAccount(userId).then(() => this.syncNow());
      } else if (status === 'signed_out') {
        this.cancelTimer();
        this.set({ phase: 'signed_out' });
      }
    };
    const s0 = this.deps.auth.store.getState();
    apply(s0.status, s0.user?.id ?? null);
    this.unsubscribeAuth = this.deps.auth.store.subscribe((s, prev) => {
      if (s.status !== prev.status || s.user?.id !== prev.user?.id) apply(s.status, s.user?.id ?? null);
    });
  }

  stop(): void {
    this.unsubscribeAuth?.();
    this.unsubscribeAuth = null;
    this.cancelTimer();
  }

  private cancelTimer(): void {
    if (this.timer !== null) this.deps.clearTimer(this.timer);
    this.timer = null;
  }

  /** Ask for a sync soon (debounced). */
  schedule(delayMs = 1500): void {
    if (!this.deps.api.enabled) return;
    this.cancelTimer();
    this.timer = this.deps.setTimer(() => {
      this.timer = null;
      void this.syncNow();
    }, delayMs);
  }

  async refreshPending(): Promise<void> {
    const p = await this.deps.repo.listPending();
    this.set({ pending: p.profiles.length + p.sessions.length + p.reps.length });
  }

  /**
   * Local data belongs to exactly one account. A guest's data is adopted by the first account that signs in; if a
   * DIFFERENT account signs in on this device, the previous account's local copy is removed first.
   */
  async adoptAccount(userId: string): Promise<'adopted' | 'same' | 'reset'> {
    const owner = await this.deps.repo.getMeta(OWNER_KEY);
    if (owner === userId) return 'same';
    if (owner === null) {
      await this.deps.repo.setMeta(OWNER_KEY, userId);
      return 'adopted';
    }
    await this.deps.repo.clearAll();
    await this.deps.repo.setMeta(OWNER_KEY, userId);
    this.refused.clear();
    this.set({ switchedAccount: true });
    this.deps.onLocalDataReset?.();
    return 'reset';
  }

  async syncNow(): Promise<void> {
    if (!this.deps.api.enabled) return this.set({ phase: 'disabled' });
    const auth = this.deps.auth.store.getState();
    if (auth.status !== 'signed_in' || !auth.user) return this.set({ phase: 'signed_out' });
    if (this.running) {
      this.rerun = true;
      return;
    }
    this.running = true;
    this.set({ phase: 'syncing', error: null });
    let retryAfterMs: number | null = null;
    try {
      await this.adoptAccount(auth.user.id);
      await this.pushAll();
      const needsMoreTime = await this.pullAll();
      this.failures = 0;
      this.set({ phase: 'idle', lastSyncedAt: this.deps.now(), error: null });
      if (needsMoreTime) retryAfterMs = 4000; // a rep arrived before its session: look again shortly
    } catch (e) {
      retryAfterMs = this.handleFailure(e);
    } finally {
      this.running = false;
      await this.refreshPending().catch(() => undefined);
    }
    if (this.rerun) {
      this.rerun = false;
      this.schedule(0);
    } else if (retryAfterMs !== null) {
      this.schedule(retryAfterMs);
    }
  }

  private handleFailure(e: unknown): number | null {
    this.failures += 1;
    const backoff = Math.min(60_000, 2000 * 2 ** (this.failures - 1));
    if (e instanceof ApiError) {
      if (e.isUnauthorized) {
        this.deps.auth.handleUnauthorized();
        this.set({ phase: 'signed_out', error: null });
        return null;
      }
      if (e.isNetwork) {
        this.set({ phase: 'offline', error: null });
        return backoff;
      }
      this.set({ phase: 'error', error: e.message });
      return e.retryAfterS ? e.retryAfterS * 1000 : backoff;
    }
    this.set({ phase: 'error', error: e instanceof Error ? e.message : String(e) });
    return backoff;
  }

  // ------------------------------------------------------------------ push
  /** Take the next batch. A rep only goes out once its session is on the server or in the same batch. */
  private takeBatch(p: PendingChanges): { profiles: PendingChanges['profiles']; sessions: StoredSession[]; reps: StoredRep[] } {
    const sessions = p.sessions.filter((s) => !this.refused.has(s.id)).slice(0, BATCH_SESSIONS);
    const inBatch = new Set(sessions.map((s) => s.id));
    const pendingSessionIds = new Set(p.sessions.map((s) => s.id));
    const reps = p.reps
      .filter((r) => !this.refused.has(r.id) && (inBatch.has(r.sessionId) || !pendingSessionIds.has(r.sessionId)))
      .slice(0, BATCH_REPS);
    return { profiles: p.profiles.filter((x) => !this.refused.has(x.id)).slice(0, BATCH_PROFILES), sessions, reps };
  }

  private async pushAll(): Promise<void> {
    for (let i = 0; i < MAX_PAGES; i++) {
      const batch = this.takeBatch(await this.deps.repo.listPending());
      if (batch.profiles.length + batch.sessions.length + batch.reps.length === 0) return;

      const result = await this.deps.api.push({
        profiles: batch.profiles.map(profileToWire),
        sessions: batch.sessions.map(sessionToWire),
        reps: batch.reps.map(repToWire),
      });

      const version = <T extends { id: string; updatedAt: number }>(rows: T[], out: PushOutcome): Acked[] =>
        out.accepted.flatMap((id) => {
          const row = rows.find((r) => r.id === id);
          return row ? [{ id, version: row.updatedAt }] : [];
        });
      await this.deps.repo.markSynced({
        profiles: version(batch.profiles, result.profiles),
        sessions: version(batch.sessions, result.sessions),
        reps: version(batch.reps, result.reps),
      });

      let progressed = result.profiles.accepted.length + result.sessions.accepted.length + result.reps.accepted.length;
      // rejections: the server deleted the session elsewhere -> drop it here; anything else is refused for good
      for (const rej of result.sessions.rejected) {
        if (rej.reason === 'session_deleted') {
          await this.deps.repo.removeSessionLocally(rej.id);
          progressed += 1;
        } else this.refused.add(rej.id);
      }
      for (const rej of result.reps.rejected) {
        if (rej.reason === 'session_deleted') {
          const rep = batch.reps.find((r) => r.id === rej.id);
          if (rep) {
            await this.deps.repo.removeSessionLocally(rep.sessionId);
            progressed += 1;
          }
        } else this.refused.add(rej.id);
      }
      for (const rej of result.profiles.rejected) this.refused.add(rej.id);
      // "stale" means the server has a newer version: the pull below brings it in and the record stops being pending
      if (progressed === 0) return;
    }
  }

  // ------------------------------------------------------------------ pull
  private async loadCursors(): Promise<Cursors> {
    try {
      const raw = await this.deps.repo.getMeta(CURSOR_KEY);
      return raw ? { ...EMPTY_CURSORS, ...(JSON.parse(raw) as Partial<Cursors>) } : { ...EMPTY_CURSORS };
    } catch {
      return { ...EMPTY_CURSORS };
    }
  }

  private toBatch(page: PullResult, parts: { profilesAndSessions: boolean; reps: boolean }): RemoteBatch {
    return {
      profiles: parts.profilesAndSessions ? page.profiles.map(profileFromWire) : [],
      sessions: parts.profilesAndSessions ? page.sessions.map(sessionFromWire) : [],
      reps: parts.reps ? page.reps.map(repFromWire) : [],
    };
  }

  /** Returns true if some reps could not be placed yet (their session is not here), so a quick second look is needed. */
  private async pullAll(): Promise<boolean> {
    let cursors = await this.loadCursors();
    const notify = (r: ApplyResult) => {
      if (r.profileChanged || r.sessions || r.reps || r.deleted) this.deps.onRemoteApplied?.(r);
    };

    // Phase A: profiles and sessions, until fully caught up (the reps cursor stays where it is)
    for (let i = 0; i < MAX_PAGES; i++) {
      const page = await this.deps.api.pull(cursors, PAGE);
      notify(await this.deps.repo.applyRemote(this.toBatch(page, { profilesAndSessions: true, reps: false })));
      cursors = { ...cursors, profiles: page.cursors.profiles, sessions: page.cursors.sessions };
      if (!page.has_more.profiles && !page.has_more.sessions) break;
    }

    // Phase B: reps. Their sessions are all here now, except for a rare race (handled below).
    let incomplete = false;
    for (let i = 0; i < MAX_PAGES; i++) {
      const page = await this.deps.api.pull(cursors, PAGE);
      const applied = await this.deps.repo.applyRemote(this.toBatch(page, { profilesAndSessions: false, reps: true }));
      notify(applied);
      if (applied.unknownSession > 0) {
        incomplete = true; // do NOT advance the reps cursor: these reps must be fetched again
        break;
      }
      cursors = { ...cursors, reps: page.cursors.reps };
      if (!page.has_more.reps) break;
    }

    await this.deps.repo.setMeta(
      CURSOR_KEY,
      JSON.stringify({ profiles: withOverlap(cursors.profiles), sessions: withOverlap(cursors.sessions), reps: withOverlap(cursors.reps) }),
    );
    return incomplete;
  }
}
