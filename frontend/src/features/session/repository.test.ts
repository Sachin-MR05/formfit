import { describe, expect, it } from 'vitest';
import { MemoryRepository, repsToCsv, CSV_COLUMNS } from './repository.ts';
import type { StoredProfile, StoredRep, StoredSession } from './types.ts';

const profile = { femurTorso: 0.94, shankFemur: 0.98, legTorso: 1.86, upSign: -1 as const };
const session = (id: string, startedAt: number): StoredSession => ({
  id, startedAt, endedAt: null, source: 'live', fileName: null, poseModel: 'full', modelVersion: 'v-test', profile,
});
const rep = (id: string, sessionId: string, index: number, label: StoredRep['label'] = null): StoredRep => ({
  id, sessionId, index, createdAt: index, tSeconds: index, profile, score: 80, personalized: 0.8, generic: 0.7, ruleOk: true,
  ruleReasons: [], codes: [], downS: 1, upS: 1, modelVersion: 'v-test', label,
  features: { knee: 60.123456, hip: 50, torso: 35, shank: 38, phi: -5 },
});
const storedProfile: StoredProfile = { profile, side: 'left', hipImageY0: 0.5, thigh2d: 0.2, samples: 20, source: 'test', createdAt: 1 };

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
