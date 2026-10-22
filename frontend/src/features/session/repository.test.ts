import { describe, expect, it } from 'vitest';
import { MemoryRepository, repsToCsv, CSV_COLUMNS } from './repository.ts';
import type { StoredProfile, StoredRep, StoredSession } from './types.ts';

const profile = { femurTorso: 0.94, shankFemur: 0.98, legTorso: 1.86, upSign: -1 as const };
const session = (id: string, startedAt: number): StoredSession => ({
  id, startedAt, endedAt: null, updatedAt: startedAt, syncedVersion: null, source: 'live', fileName: null, poseModel: 'full', modelVersion: 'v-test', profile,
});
const rep = (id: string, sessionId: string, index: number, label: StoredRep['label'] = null): StoredRep => ({
  id, sessionId, index, createdAt: index, tSeconds: index, profile, score: 80, personalized: 0.8, generic: 0.7, ruleOk: true,
  ruleReasons: [], codes: [], downS: 1, upS: 1, modelVersion: 'v-test', label, updatedAt: index, syncedVersion: null,
  features: { knee: 60.123456, hip: 50, torso: 35, shank: 38, phi: -5 },
});
const storedProfile: StoredProfile = { id: 'prof-0001', updatedAt: 1, syncedVersion: null, profile, side: 'left', hipImageY0: 0.5, thigh2d: 0.2, samples: 20, source: 'test', createdAt: 1 };

describe('MemoryRepository', () => {
  it('round-trips the body profile', async () => {
    const r = new MemoryRepository();
    expect(await r.loadProfile()).toBeNull();
    await r.saveProfile(storedProfile);
    expect(await r.loadProfile()).toEqual(storedProfile);
    await r.clearProfile();
    expect(await r.loadProfile()).toBeNull();
  });

  it('lists sessions newest first and reps in order', async () => {
    const r = new MemoryRepository();
    await r.createSession(session('a', 10));
    await r.createSession(session('b', 20));
    await r.addRep(rep('r2', 'a', 2));
    await r.addRep(rep('r1', 'a', 1));
    await r.addRep(rep('r3', 'b', 1));
    expect((await r.listSessions()).map((s) => s.id)).toEqual(['b', 'a']);
    expect((await r.listReps('a')).map((x) => x.index)).toEqual([1, 2]);
  });

  it('updates a session, labels a rep, and deletes a session with its reps', async () => {
    const r = new MemoryRepository();
    await r.createSession(session('a', 1));
    await r.addRep(rep('r1', 'a', 1));
    await r.updateSession('a', { endedAt: 99 });
    await r.setRepLabel('r1', 'faulty');
    expect((await r.listSessions())[0]!.endedAt).toBe(99);
    expect((await r.listReps('a'))[0]!.label).toBe('faulty');
    await r.deleteSession('a');
    expect(await r.listSessions()).toHaveLength(0);
    expect(await r.listAllReps()).toHaveLength(0);
  });

  it('fails loudly for unknown ids', async () => {
    const r = new MemoryRepository();
    let threw = false;
    try { await r.updateSession('nope', {}); } catch { threw = true; }
    expect(threw).toBe(true);
  });

  it('stores copies, not references', async () => {
    const r = new MemoryRepository();
    const s = session('a', 1);
    await r.createSession(s);
    s.fileName = 'mutated';
    expect((await r.listSessions())[0]!.fileName).toBeNull();
  });
});

describe('repsToCsv (feeds ml/scripts/export_for_frontend.py --csv)', () => {
  it('has the exact columns the Python trainer expects', () => {
    expect([...CSV_COLUMNS]).toEqual(['person_id', 'rep_id', 'knee', 'hip', 'torso', 'shank', 'phi', 'femur_torso', 'shank_femur', 'leg_torso', 'label']);
  });

  it('exports only labelled reps with good=1 / faulty=0', () => {
    const csv = repsToCsv([rep('a', 's', 1, 'good'), rep('b', 's', 2, 'faulty'), rep('c', 's', 3, null)], 'p01').split('\n');
    expect(csv).toHaveLength(3);
    expect(csv[1]).toBe('p01,1,60.1235,50.0000,35.0000,38.0000,-5.0000,0.9400,0.9800,1.8600,1');
    expect(csv[2]!.endsWith(',0')).toBe(true);
  });
});

// ----------------------------------------------------------------------------- sync bookkeeping
const frozen = (t = 1000) => ({ now: () => t });
const ack = (id: string, version: number) => ({ id, version });

describe('versions and pending changes', () => {
  it('everything new is pending until the server acknowledges that exact version', async () => {
    const r = new MemoryRepository();
    await r.createSession(session('s1', 10));
    await r.addRep(rep('r1', 's1', 1));
    await r.saveProfile(storedProfile);
    const p = await r.listPending();
    expect([p.profiles.length, p.sessions.length, p.reps.length]).toEqual([1, 1, 1]);

    await r.markSynced({ profiles: [ack('prof-0001', 1)], sessions: [ack('s1', 10)], reps: [ack('r1', 1)] });
    const after = await r.listPending();
    expect([after.profiles.length, after.sessions.length, after.reps.length]).toEqual([0, 0, 0]);
  });

  it('a record edited while its push was in flight stays pending', async () => {
    const r = new MemoryRepository(() => 500);
    await r.createSession(session('s1', 10));
    await r.updateSession('s1', { endedAt: 99 }); // version moves to 500
    await r.markSynced({ profiles: [], sessions: [ack('s1', 10)], reps: [] }); // ack for the OLD version
    expect((await r.listPending()).sessions).toHaveLength(1);
    await r.markSynced({ profiles: [], sessions: [ack('s1', 500)], reps: [] });
    expect((await r.listPending()).sessions).toHaveLength(0);
  });

  it('every change moves the version strictly forward, even within one millisecond', async () => {
    const r = new MemoryRepository(frozen(1000).now);
    await r.createSession(session('s1', 10));
    await r.updateSession('s1', { endedAt: 1 });
    const v1 = (await r.listSessions())[0]!.updatedAt;
    await r.updateSession('s1', { endedAt: 2 });
    const v2 = (await r.listSessions())[0]!.updatedAt;
    expect(v1).toBe(1000);
    expect(v2).toBe(1001);
  });

  it('labelling a synced rep makes it pending again', async () => {
    const r = new MemoryRepository(() => 777);
    await r.createSession(session('s1', 10));
    await r.addRep(rep('r1', 's1', 1));
    await r.markSynced({ profiles: [], sessions: [ack('s1', 10)], reps: [ack('r1', 1)] });
    await r.setRepLabel('r1', 'good');
    const pending = (await r.listPending()).reps;
    expect(pending.map((x) => [x.id, x.label, x.updatedAt])).toEqual([['r1', 'good', 777]]);
  });

  it('records saved by older versions (no sync fields) count as never synced', async () => {
    const r = new MemoryRepository();
    const legacy = { ...session('old', 5) } as Partial<StoredSession>;
    delete legacy.updatedAt;
    delete legacy.syncedVersion;
    await r.createSession(legacy as StoredSession);
    const p = (await r.listPending()).sessions[0]!;
    expect([p.id, p.updatedAt, p.syncedVersion]).toEqual(['old', 5, null]);
  });
});

describe('deleting sessions', () => {
  it('a session that never left the device is simply removed', async () => {
    const r = new MemoryRepository();
    await r.createSession(session('s1', 10));
    await r.addRep(rep('r1', 's1', 1));
    await r.deleteSession('s1');
    expect(await r.listSessions()).toHaveLength(0);
    expect(await r.listAllReps()).toHaveLength(0);
    expect((await r.listPending()).sessions).toHaveLength(0); // nothing to tell the server
  });

  it('a synced session leaves a hidden tombstone until the server confirms', async () => {
    const r = new MemoryRepository(() => 900);
    await r.createSession({ ...session('s1', 10), fileName: 'private.mp4' });
    await r.addRep(rep('r1', 's1', 1));
    await r.markSynced({ profiles: [], sessions: [ack('s1', 10)], reps: [ack('r1', 1)] });
    await r.deleteSession('s1');
    expect(await r.listSessions()).toHaveLength(0); // hidden
    expect(await r.listAllReps()).toHaveLength(0); // reps gone
    const pending = (await r.listPending()).sessions;
    expect(pending).toHaveLength(1);
    expect([pending[0]!.deleted, pending[0]!.fileName, pending[0]!.updatedAt]).toEqual([true, null, 900]);
    await r.markSynced({ profiles: [], sessions: [ack('s1', 900)], reps: [] });
    expect((await r.listPending()).sessions).toHaveLength(0); // tombstone removed
  });
});

describe('applyRemote (merging what the server sends)', () => {
  const remoteSession = (id: string, updatedAt: number, over: Partial<StoredSession> = {}): StoredSession => ({ ...session(id, 10), updatedAt, ...over });

  it('stores new remote data as already synced', async () => {
    const r = new MemoryRepository();
    const res = await r.applyRemote({ profiles: [], sessions: [remoteSession('s1', 50)], reps: [{ ...rep('r1', 's1', 1), updatedAt: 60 }] });
    expect([res.sessions, res.reps]).toEqual([1, 1]);
    expect((await r.listPending()).sessions).toHaveLength(0);
    expect((await r.listReps('s1'))[0]!.syncedVersion).toBe(60);
  });

  it('keeps a newer local version (it will be pushed) and takes a newer remote one', async () => {
    const r = new MemoryRepository(() => 400);
    await r.createSession(session('s1', 10));
    await r.updateSession('s1', { endedAt: 7 }); // local version 400
    await r.applyRemote({ profiles: [], sessions: [remoteSession('s1', 100, { endedAt: 1 })], reps: [] });
    expect((await r.listSessions())[0]!.endedAt).toBe(7);
    await r.applyRemote({ profiles: [], sessions: [remoteSession('s1', 900, { endedAt: 2 })], reps: [] });
    expect((await r.listSessions())[0]!.endedAt).toBe(2);
  });

  it('a deletion from another device wins and removes the reps', async () => {
    const r = new MemoryRepository();
    await r.createSession(session('s1', 10));
    await r.addRep(rep('r1', 's1', 1));
    const res = await r.applyRemote({ profiles: [], sessions: [{ id: 's1', deleted: true, updatedAt: 99 }], reps: [] });
    expect(res.deleted).toBe(1);
    expect(await r.listSessions()).toHaveLength(0);
    expect(await r.listAllReps()).toHaveLength(0);
  });

  it('never resurrects something we deleted ourselves, and ignores reps of unknown sessions', async () => {
    const r = new MemoryRepository();
    await r.createSession(session('s1', 10));
    await r.markSynced({ profiles: [], sessions: [ack('s1', 10)], reps: [] });
    await r.deleteSession('s1');
    await r.applyRemote({ profiles: [], sessions: [remoteSession('s1', 20)], reps: [rep('r9', 's1', 1), rep('r8', 'ghost-session', 1)] });
    expect(await r.listSessions()).toHaveLength(0);
    expect(await r.listAllReps()).toHaveLength(0);
  });

  it('adopts the newest remote body profile, but not an older one', async () => {
    const r = new MemoryRepository();
    const older = { ...storedProfile, id: 'prof-old1', createdAt: 5, updatedAt: 5 };
    const newer = { ...storedProfile, id: 'prof-new1', createdAt: 50, updatedAt: 50 };
    expect((await r.applyRemote({ profiles: [older], sessions: [], reps: [] })).profileChanged).toBe(true);
    expect((await r.loadProfile())?.id).toBe('prof-old1');
    expect((await r.applyRemote({ profiles: [newer, older], sessions: [], reps: [] })).profileChanged).toBe(true);
    expect((await r.loadProfile())?.id).toBe('prof-new1');
    expect((await r.applyRemote({ profiles: [older], sessions: [], reps: [] })).profileChanged).toBe(false);
    expect((await r.loadProfile())?.id).toBe('prof-new1');
    expect((await r.listPending()).profiles).toHaveLength(0);
  });
});

describe('meta and wiping', () => {
  it('stores small settings such as the sync cursors and account owner', async () => {
    const r = new MemoryRepository();
    expect(await r.getMeta('owner')).toBeNull();
    await r.setMeta('owner', 'user-1');
    expect(await r.getMeta('owner')).toBe('user-1');
    await r.setMeta('owner', null);
    expect(await r.getMeta('owner')).toBeNull();
  });

  it('clearAll removes data, the profile and all sync bookkeeping', async () => {
    const r = new MemoryRepository();
    await r.createSession(session('s1', 10));
    await r.saveProfile(storedProfile);
    await r.setMeta('owner', 'user-1');
    await r.clearAll();
    expect([(await r.listSessions()).length, await r.loadProfile(), await r.getMeta('owner')]).toEqual([0, null, null]);
  });
});
