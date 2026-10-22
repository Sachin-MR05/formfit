import { describe, expect, it } from 'vitest';
import { MemoryRepository } from '../session/repository.ts';
import type { StoredProfile, StoredRep, StoredSession } from '../session/types.ts';
import { ApiError } from './api.ts';
import { AuthManager } from './auth.ts';
import { BATCH_REPS, SyncEngine, withOverlap, type SyncDeps } from './syncEngine.ts';
import type { Cursors, PullResult, PushOutcome, PushPayload, PushResult, SyncApi, WireRep, WireSession } from './types.ts';

// ------------------------------------------------------------------ fakes
const outcome = (accepted: string[] = []): PushOutcome => ({ accepted, stale: [], rejected: [] });

class FakeApi implements SyncApi {
  enabled = true;
  pushes: PushPayload[] = [];
  pulls: Array<Partial<Cursors>> = [];
  pushHandler: (p: PushPayload) => PushResult = (p) => ({
    server_time: 1, profiles: outcome(p.profiles.map((x) => x.id)), sessions: outcome(p.sessions.map((x) => x.id)), reps: outcome(p.reps.map((x) => x.id)),
  });
  pullQueue: Array<PullResult | Error> = [];
  async push(p: PushPayload): Promise<PushResult> {
    this.pushes.push(p);
    return this.pushHandler(p);
  }
  async pull(c: Partial<Cursors>): Promise<PullResult> {
    this.pulls.push(c);
    const next = this.pullQueue.shift();
    if (next instanceof Error) throw next;
    return next ?? emptyPull(c);
  }
}

const emptyPull = (c: Partial<Cursors> = {}): PullResult => ({
  server_time: 1, profiles: [], sessions: [], reps: [],
  cursors: { profiles: c.profiles ?? '0:', sessions: c.sessions ?? '0:', reps: c.reps ?? '0:' },
  has_more: { profiles: false, sessions: false, reps: false },
});

const ratios = { femurTorso: 0.94, shankFemur: 0.98, legTorso: 1.86, upSign: -1 as const };
const wireSession = (id: string, updated = 100): WireSession => ({
  id, updated_at: updated, server_updated_at: updated, started_at: 10, ended_at: null, source: 'live', file_name: null, pose_model: 'full', model_version: 'v1',
  profile: { femur_torso: 0.94, shank_femur: 0.98, leg_torso: 1.86, up_sign: -1 },
});
const wireRep = (id: string, sessionId: string, index = 1, updated = 100): WireRep => ({
  id, session_id: sessionId, index, created_at: 11, t_seconds: 1, features: { knee: 60, hip: 50, torso: 35, shank: 38, phi: -5 },
  profile: { femur_torso: 0.94, shank_femur: 0.98, leg_torso: 1.86 }, score: 80, personalized: 0.8, generic: 0.7, rule_ok: true, rule_reasons: [], codes: [],
  down_s: 1, up_s: 1, model_version: 'v1', label: null, updated_at: updated, server_updated_at: updated,
});
const localSession = (id: string, started = 10): StoredSession => ({
  id, startedAt: started, endedAt: null, updatedAt: started, syncedVersion: null, source: 'live', fileName: null, poseModel: 'full', modelVersion: 'v1', profile: ratios,
});
const localRep = (id: string, sessionId: string, index = 1): StoredRep => ({
  id, sessionId, index, createdAt: index, updatedAt: index, syncedVersion: null, tSeconds: 1, features: { knee: 60, hip: 50, torso: 35, shank: 38, phi: -5 },
  profile: ratios, score: 80, personalized: 0.8, generic: 0.7, ruleOk: true, ruleReasons: [], codes: [], downS: 1, upS: 1, modelVersion: 'v1', label: null,
});
const localProfile = (id = 'prof-0001', created = 5): StoredProfile => ({
  id, kind: 'measured', profile: ratios, side: 'left', hipImageY0: 0.5, thigh2d: 0.2, samples: 10, source: 'x', createdAt: created, updatedAt: created, syncedVersion: null,
});

async function rig(over: Partial<SyncDeps> = {}, signedIn = true, userId = 'user-1') {
  const api = new FakeApi();
  const repo = new MemoryRepository(() => 5000);
  const auth = new AuthManager(null);
  auth.bind({
    signup: async () => { throw new Error('unused'); },
    login: async () => ({ user: { id: userId, email: 'a@b.co', display_name: null, created_at: 1 }, access_token: 't', token_type: 'bearer', expires_in: 1 }),
    me: async () => { throw new Error('unused'); },
  });
  if (signedIn) await auth.signIn('a@b.co', 'x');
  const timers: Array<{ fn: () => void; ms: number }> = [];
  let clock = 1_000_000;
  const resets: string[] = [];
  const applied: unknown[] = [];
  const engine = new SyncEngine({
    api, auth, repo, now: () => clock,
    setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length - 1; },
    clearTimer: (h) => { const t = timers[h as number]; if (t) t.fn = () => {}; },
    onLocalDataReset: () => void resets.push('reset'),
    onRemoteApplied: (r) => void applied.push(r),
    ...over,
  });
  return { api, repo, auth, engine, timers, resets, applied, tick: (ms: number) => void (clock += ms) };
}
const state = (e: SyncEngine) => e.store.getState();

describe('push', () => {
  it('uploads local changes, sessions before reps, and marks them synced', async () => {
    const r = await rig();
    await r.repo.saveProfile(localProfile());
    await r.repo.createSession(localSession('sess-0001'));
    await r.repo.addRep(localRep('rep-00001', 'sess-0001'));
    await r.engine.syncNow();
    expect(r.api.pushes).toHaveLength(1);
    expect([r.api.pushes[0]!.profiles.length, r.api.pushes[0]!.sessions.length, r.api.pushes[0]!.reps.length]).toEqual([1, 1, 1]);
    expect(state(r.engine)).toMatchObject({ phase: 'idle', pending: 0, error: null });
    expect(state(r.engine).lastSyncedAt).toBe(1_000_000);
    expect((await r.repo.listPending()).reps).toHaveLength(0);
  });

  it('does nothing when there is nothing to send', async () => {
    const r = await rig();
    await r.engine.syncNow();
    expect(r.api.pushes).toHaveLength(0);
    expect(state(r.engine).phase).toBe('idle');
  });

  it('sends large histories in batches', async () => {
    const r = await rig();
    await r.repo.createSession(localSession('sess-0001'));
    for (let i = 1; i <= BATCH_REPS + 20; i++) await r.repo.addRep(localRep(`rep-${String(i).padStart(5, '0')}`, 'sess-0001', i));
    await r.engine.syncNow();
    expect(r.api.pushes.map((p) => p.reps.length)).toEqual([BATCH_REPS, 20]);
    expect(state(r.engine).pending).toBe(0);
  });

  it('a record changed again after it was synced is sent again', async () => {
    const r = await rig();
    await r.repo.createSession(localSession('sess-0001'));
    await r.repo.addRep(localRep('rep-00001', 'sess-0001'));
    await r.engine.syncNow();
    await r.repo.setRepLabel('rep-00001', 'good');
    await r.engine.syncNow();
    expect(r.api.pushes).toHaveLength(2);
    expect(r.api.pushes[1]!.reps[0]!.label).toBe('good');
    expect(r.api.pushes[1]!.sessions).toHaveLength(0);
  });

  it('sends a deletion as a tombstone and then forgets it', async () => {
    const r = await rig();
    await r.repo.createSession(localSession('sess-0001'));
    await r.engine.syncNow();
    await r.repo.deleteSession('sess-0001');
    await r.engine.syncNow();
    expect(r.api.pushes[1]!.sessions[0]).toMatchObject({ id: 'sess-0001', deleted: true });
    expect((await r.repo.listPending()).sessions).toHaveLength(0);
  });

  it('"stale" answers leave the record pending but never loop', async () => {
    const r = await rig();
    r.api.pushHandler = (p) => ({ server_time: 1, profiles: outcome(), sessions: { accepted: [], stale: p.sessions.map((s) => s.id), rejected: [] }, reps: outcome() });
    await r.repo.createSession(localSession('sess-0001'));
    await r.engine.syncNow();
    expect(r.api.pushes).toHaveLength(1);
    expect(state(r.engine).pending).toBe(1);
    expect(state(r.engine).phase).toBe('idle');
  });

  it('when the server says a session was deleted elsewhere, it is removed here', async () => {
    const r = await rig();
    await r.repo.createSession(localSession('sess-0001'));
    await r.repo.addRep(localRep('rep-00001', 'sess-0001'));
    r.api.pushHandler = () => ({ server_time: 1, profiles: outcome(), sessions: { accepted: [], stale: [], rejected: [{ id: 'sess-0001', reason: 'session_deleted' }] }, reps: outcome() });
    await r.engine.syncNow();
    expect(await r.repo.listSessions()).toHaveLength(0);
    expect(await r.repo.listAllReps()).toHaveLength(0);
  });

  it('a record the server refuses for good does not block the others or loop forever', async () => {
    const r = await rig();
    await r.repo.createSession(localSession('sess-bad01'));
    await r.repo.createSession(localSession('sess-good1'));
    r.api.pushHandler = (p) => ({
      server_time: 1, profiles: outcome(),
      sessions: { accepted: p.sessions.filter((s) => s.id !== 'sess-bad01').map((s) => s.id), stale: [], rejected: p.sessions.filter((s) => s.id === 'sess-bad01').map((s) => ({ id: s.id, reason: 'id_conflict' })) },
      reps: outcome(),
    });
    await r.engine.syncNow();
    await r.engine.syncNow();
    expect(r.api.pushes.flatMap((p) => p.sessions.map((s) => s.id))).toEqual(['sess-bad01', 'sess-good1']); // bad one is tried once only
    expect(state(r.engine).pending).toBe(1);
  });
});

describe('pull', () => {
  it('applies remote sessions and reps, drains sessions before reps, and remembers the cursors with an overlap', async () => {
    const r = await rig();
    r.api.pullQueue = [
      { ...emptyPull(), sessions: [wireSession('sess-0001')], cursors: { profiles: '0:', sessions: '9000:sess-0001', reps: '0:' } },
      { ...emptyPull(), reps: [wireRep('rep-00001', 'sess-0001')], cursors: { profiles: '0:', sessions: '9000:sess-0001', reps: '9500:rep-00001' } },
    ];
    await r.engine.syncNow();
    expect((await r.repo.listSessions()).map((s) => s.id)).toEqual(['sess-0001']);
    expect((await r.repo.listReps('sess-0001')).map((x) => x.id)).toEqual(['rep-00001']);
    expect((await r.repo.listPending()).sessions).toHaveLength(0);
    expect(JSON.parse((await r.repo.getMeta('cursors'))!)).toEqual({ profiles: '0:', sessions: `${9000 - 5000}:`, reps: `${9500 - 5000}:` });
    // the next sync starts from the saved cursors
    await r.engine.syncNow();
    expect(r.api.pulls[2]).toMatchObject({ sessions: '4000:', reps: '4500:' });
  });

  it('pages through long histories', async () => {
    const r = await rig();
    r.api.pullQueue = [
      { ...emptyPull(), sessions: [wireSession('sess-0001')], cursors: { profiles: '0:', sessions: '100:sess-0001', reps: '0:' }, has_more: { profiles: false, sessions: true, reps: false } },
      { ...emptyPull(), sessions: [wireSession('sess-0002', 200)], cursors: { profiles: '0:', sessions: '200:sess-0002', reps: '0:' } },
    ];
    await r.engine.syncNow();
    expect((await r.repo.listSessions()).map((s) => s.id).sort()).toEqual(['sess-0001', 'sess-0002']);
    expect(r.api.pulls[1]).toMatchObject({ sessions: '100:sess-0001' });
  });

  it('a deletion from another device removes the session here', async () => {
    const r = await rig();
    await r.repo.createSession(localSession('sess-0001'));
    await r.engine.syncNow(); // synced
    r.api.pullQueue = [{ ...emptyPull(), sessions: [{ id: 'sess-0001', updated_at: 999, deleted: true }] }];
    await r.engine.syncNow();
    expect(await r.repo.listSessions()).toHaveLength(0);
  });

  it('does not lose a rep whose session has not arrived: the reps cursor stays and a quick retry is scheduled', async () => {
    const r = await rig();
    r.api.pullQueue = [emptyPull(), { ...emptyPull(), reps: [wireRep('rep-00001', 'sess-0001')], cursors: { profiles: '0:', sessions: '0:', reps: '9500:rep-00001' } }];
    await r.engine.syncNow();
    expect(JSON.parse((await r.repo.getMeta('cursors'))!).reps).toBe('0:'); // NOT advanced
    expect(r.timers.some((t) => t.ms === 4000)).toBe(true);
    // the session shows up on the retry and the rep is then stored
    r.api.pullQueue = [{ ...emptyPull(), sessions: [wireSession('sess-0001')] }, { ...emptyPull(), reps: [wireRep('rep-00001', 'sess-0001')], cursors: { profiles: '0:', sessions: '0:', reps: '9500:rep-00001' } }];
    await r.engine.syncNow();
    expect((await r.repo.listAllReps()).map((x) => x.id)).toEqual(['rep-00001']);
  });

  it('tells the app when remote data (like a body profile from another device) arrived', async () => {
    const r = await rig();
    r.api.pullQueue = [{ ...emptyPull(), profiles: [{ id: 'prof-remote', kind: 'measured', femur_torso: 1, shank_femur: 1, leg_torso: 2, up_sign: -1, side: 'left', samples: 9, source: 'phone', hip_image_y0: 0.5, thigh2d: 0.2, created_at: 50, updated_at: 50 }] }];
    await r.engine.syncNow();
    expect((await r.repo.loadProfile())?.id).toBe('prof-remote');
    expect(r.applied.some((a) => (a as { profileChanged: boolean }).profileChanged)).toBe(true);
  });
});

describe('failures', () => {
  it('works offline: data stays pending, phase is "offline", and it retries with growing delays', async () => {
    const r = await rig();
    await r.repo.createSession(localSession('sess-0001'));
    r.api.pushHandler = () => { throw new ApiError(0, 'network', 'offline'); };
    await r.engine.syncNow();
    expect(state(r.engine)).toMatchObject({ phase: 'offline', pending: 1 });
    expect(r.timers.at(-1)!.ms).toBe(2000);
    await r.engine.syncNow();
    expect(r.timers.at(-1)!.ms).toBe(4000);
    // back online
    r.api.pushHandler = (p) => ({ server_time: 1, profiles: outcome(), sessions: outcome(p.sessions.map((s) => s.id)), reps: outcome() });
    await r.engine.syncNow();
    expect(state(r.engine)).toMatchObject({ phase: 'idle', pending: 0 });
    await r.repo.createSession(localSession('sess-0002'));
    r.api.pushHandler = () => { throw new ApiError(0, 'network', 'offline'); };
    await r.engine.syncNow();
    expect(r.timers.at(-1)!.ms).toBe(2000); // the backoff restarted after a success
  });

  it('a rejected token signs the user out and stops retrying', async () => {
    const r = await rig();
    await r.repo.createSession(localSession('sess-0001'));
    r.api.pushHandler = () => { throw new ApiError(401, 'token_expired', 'expired'); };
    const before = r.timers.length;
    await r.engine.syncNow();
    expect(r.auth.store.getState().status).toBe('signed_out');
    expect(state(r.engine).phase).toBe('signed_out');
    expect(r.timers.length).toBe(before);
    expect((await r.repo.listPending()).sessions).toHaveLength(1); // nothing lost
  });

  it('server errors are shown and retried later; throttling honours Retry-After', async () => {
    const r = await rig();
    await r.repo.createSession(localSession('sess-0001'));
    r.api.pushHandler = () => { throw new ApiError(500, 'internal_error', 'Something went wrong on our side.'); };
    await r.engine.syncNow();
    expect(state(r.engine)).toMatchObject({ phase: 'error', error: 'Something went wrong on our side.' });
    r.api.pushHandler = () => { throw new ApiError(429, 'rate_limited', 'Slow down', {}, 30); };
    await r.engine.syncNow();
    expect(r.timers.at(-1)!.ms).toBe(30_000);
  });

  it('a pull failure after a successful push keeps the pushed data marked as synced', async () => {
    const r = await rig();
    await r.repo.createSession(localSession('sess-0001'));
    r.api.pullQueue = [new ApiError(500, 'internal_error', 'boom')];
    await r.engine.syncNow();
    expect(state(r.engine).phase).toBe('error');
    expect((await r.repo.listPending()).sessions).toHaveLength(0);
  });
});

describe('triggers and state', () => {
  it('does nothing without a configured server or without a signed-in user', async () => {
    const off = await rig();
    off.api.enabled = false;
    await off.engine.syncNow();
    expect(state(off.engine).phase).toBe('disabled');
    const out = await rig({}, false);
    await out.engine.syncNow();
    expect(state(out.engine).phase).toBe('signed_out');
    expect(out.api.pushes.length + out.api.pulls.length).toBe(0);
  });

  it('schedule() debounces: only the last request fires', async () => {
    const r = await rig();
    r.engine.schedule(1500);
    r.engine.schedule(1500);
    r.engine.schedule(1500);
    r.timers.forEach((t) => t.fn());
    await new Promise((res) => setTimeout(res, 0));
    expect(r.api.pulls.length).toBe(2); // exactly one sync (two pull phases)
  });

  it('a sync requested during a sync runs once more afterwards', async () => {
    const r = await rig();
    await r.repo.createSession(localSession('sess-0001'));
    let release: () => void = () => {};
    r.api.pushHandler = (p) => ({ server_time: 1, profiles: outcome(), sessions: outcome(p.sessions.map((s) => s.id)), reps: outcome() });
    const gate = new Promise<void>((res) => (release = res));
    const origPush = r.api.push.bind(r.api);
    r.api.push = async (p) => { await gate; return origPush(p); };
    const first = r.engine.syncNow();
    await r.engine.syncNow(); // returns immediately: already running
    release();
    await first;
    expect(r.timers.some((t) => t.ms === 0)).toBe(true);
  });

  it('signing in triggers a sync; signing out stops it', async () => {
    const r = await rig({}, false);
    r.engine.start();
    expect(state(r.engine).phase).toBe('signed_out');
    await r.auth.signIn('a@b.co', 'x');
    await new Promise((res) => setTimeout(res, 5));
    expect(r.api.pulls.length).toBeGreaterThan(0);
    r.auth.signOut();
    expect(state(r.engine).phase).toBe('signed_out');
    r.engine.stop();
  });

  it('withOverlap steps a cursor back and tolerates junk', () => {
    expect(withOverlap('9000:abc')).toBe('4000:');
    expect(withOverlap('100:abc')).toBe('0:');
    expect(withOverlap('junk')).toBe('0:');
  });
});

describe('account ownership on a shared device', () => {
  it('the first account adopts what a guest created, and syncs it', async () => {
    const r = await rig({}, false);
    await r.repo.createSession(localSession('sess-guest1'));
    await r.auth.signIn('a@b.co', 'x');
    expect(await r.engine.adoptAccount('user-1')).toBe('adopted');
    await r.engine.syncNow();
    expect(r.api.pushes[0]!.sessions[0]!.id).toBe('sess-guest1');
    expect(await r.engine.adoptAccount('user-1')).toBe('same');
  });

  it('a different account never inherits (or uploads) the previous account\'s local data', async () => {
    const r = await rig({}, true, 'user-2');
    await r.repo.setMeta('owner', 'user-1');
    await r.repo.createSession(localSession('sess-ofuser1'));
    await r.repo.saveProfile(localProfile());
    await r.engine.syncNow();
    expect(r.resets).toEqual(['reset']);
    expect(state(r.engine).switchedAccount).toBe(true);
    expect(await r.repo.listSessions()).toHaveLength(0);
    expect(await r.repo.loadProfile()).toBeNull();
    expect(r.api.pushes.flatMap((p) => p.sessions)).toHaveLength(0); // nothing of user-1 reached user-2's account
    expect(await r.repo.getMeta('owner')).toBe('user-2');
  });
});
