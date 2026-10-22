/**
 * End-to-end check of the sync client against the REAL backend code over real HTTP.
 *
 *   npm run e2e:sync            (needs Python with PyJWT:  pip install PyJWT   and Node 22.7+)
 *
 * It starts backend/tests/serve_e2e.py (the framework-free dispatcher served by the standard library), then drives two
 * simulated devices through sign-up, sync, labelling, conflicts, deletion, offline behaviour and an account switch.
 */
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { MemoryRepository } from '../src/features/session/repository.ts';
import type { StoredRep, StoredSession } from '../src/features/session/types.ts';
import { ApiClient, ApiError } from '../src/features/sync/api.ts';
import { AuthManager } from '../src/features/sync/auth.ts';
import { SyncEngine } from '../src/features/sync/syncEngine.ts';

const backendDir = process.env['FORMFIT_BACKEND_DIR'] ?? new URL('../../backend/', import.meta.url).pathname;
const python = process.env['PYTHON'] ?? 'python3';

async function startServer(): Promise<{ base: string; stop: () => void }> {
  const child: ChildProcess = spawn(python, ['tests/serve_e2e.py'], { cwd: backendDir, stdio: ['ignore', 'pipe', 'inherit'] });
  const base = await new Promise<string>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('the backend did not start in 20 s')), 20_000);
    child.on('error', reject);
    child.on('exit', (code) => reject(new Error(`the backend exited early (code ${code}). Is PyJWT installed?`)));
    child.stdout!.on('data', (d) => {
      const m = /LISTENING (\S+)/.exec(String(d));
      if (m) {
        clearTimeout(t);
        resolve(m[1]!);
      }
    });
  });
  return { base, stop: () => child.kill() };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function device(base: string, network: { down: boolean } = { down: false }) {
  const repo = new MemoryRepository();
  const auth = new AuthManager(null);
  const flaky: typeof fetch = (u, i) => (network.down ? Promise.reject(new TypeError('fetch failed')) : fetch(u, i));
  const api = new ApiClient({ baseUrl: base, fetch: flaky, getToken: () => auth.token, timeoutMs: 5000 });
  auth.bind(api);
  const resets: string[] = [];
  const engine = new SyncEngine({ api, auth, repo, now: () => Date.now(), setTimer: () => 0, clearTimer: () => {}, onLocalDataReset: () => void resets.push('reset') });
  return { repo, auth, api, engine, resets };
}
type Device = ReturnType<typeof device>;

const ratios = { femurTorso: 0.94, shankFemur: 0.98, legTorso: 1.86, upSign: -1 as const };
const now = () => Date.now();
const mkSession = (id: string): StoredSession => ({ id, startedAt: now(), endedAt: now() + 1000, updatedAt: now(), syncedVersion: null, source: 'live', fileName: null, poseModel: 'full', modelVersion: 'e2e', profile: ratios });
const mkRep = (id: string, sessionId: string, index: number): StoredRep => ({
  id, sessionId, index, createdAt: now() + index, updatedAt: now(), syncedVersion: null, tSeconds: index * 3.5,
  features: { knee: 60.123456789, hip: 50.5, torso: 35.25, shank: 38.75, phi: -5.5 }, profile: ratios, score: 50 + (index % 50), personalized: (50 + (index % 50)) / 100, generic: 0.7, ruleOk: true,
  ruleReasons: [], codes: ['torso_forward'], downS: 1.2, upS: 0.9, modelVersion: 'e2e', label: null,
});

async function signedIn(d: Device, email: string, create: boolean, password = 'e2e-password-1'): Promise<void> {
  if (create) await d.auth.signUp(email, password, 'E2E', true);
  else await d.auth.signIn(email, password);
  await d.engine.adoptAccount(d.auth.store.getState().user!.id);
}

let passed = 0;
const step = async (name: string, fn: () => Promise<void>) => {
  await fn();
  passed += 1;
  console.log(`  OK  ${name}`);
};

const server = await startServer();
try {
  const email = `e2e-${Date.now()}@example.com`;
  const A = device(server.base);
  const B = device(server.base);

  await step('device A signs up, records a session and syncs it', async () => {
    await signedIn(A, email, true);
    await A.repo.saveProfile({ id: 'prof-e2e-0001', kind: 'measured', profile: ratios, side: 'left', hipImageY0: 0.5, thigh2d: 0.2, samples: 20, source: 'e2e', createdAt: now(), updatedAt: now(), syncedVersion: null });
    await A.repo.createSession(mkSession('sess-e2e-0001'));
    for (let i = 1; i <= 3; i++) await A.repo.addRep(mkRep(`rep-e2e-000${i}`, 'sess-e2e-0001', i));
    await A.engine.syncNow();
    assert.equal(A.engine.store.getState().phase, 'idle', String(A.engine.store.getState().error));
    assert.equal(A.engine.store.getState().pending, 0);
  });

  await step('device B signs in and receives the same session, reps and body profile', async () => {
    await signedIn(B, email, false);
    await B.engine.syncNow();
    assert.deepEqual((await B.repo.listSessions()).map((s) => s.id), ['sess-e2e-0001']);
    const reps = await B.repo.listReps('sess-e2e-0001');
    assert.deepEqual(reps.map((r) => r.index), [1, 2, 3]);
    assert.equal(reps[0]!.features.knee, 60.123456789); // numbers survive Python + SQLite + JSON unchanged
    assert.deepEqual(reps[0]!.codes, ['torso_forward']);
    assert.equal((await B.repo.loadProfile())?.id, 'prof-e2e-0001');
    assert.equal((await B.repo.listPending()).reps.length, 0);
  });

  await step('a label set on B reaches A', async () => {
    await B.repo.setRepLabel('rep-e2e-0002', 'faulty');
    await B.engine.syncNow();
    await A.engine.syncNow();
    assert.equal((await A.repo.listReps('sess-e2e-0001'))[1]!.label, 'faulty');
  });

  await step('conflicting edits: the later one wins on both devices', async () => {
    await A.repo.setRepLabel('rep-e2e-0003', 'good');
    await sleep(15);
    await B.repo.setRepLabel('rep-e2e-0003', 'faulty'); // later
    await A.engine.syncNow(); // A uploads "good"
    await B.engine.syncNow(); // B uploads "faulty" (newer) and pulls
    await A.engine.syncNow(); // A pulls the winner
    for (const d of [A, B]) assert.equal((await d.repo.listReps('sess-e2e-0001'))[2]!.label, 'faulty');
  });

  await step('an older offline edit cannot overwrite a newer one', async () => {
    await A.repo.setRepLabel('rep-e2e-0001', 'good'); // A edits first ...
    await sleep(15);
    await B.repo.setRepLabel('rep-e2e-0001', 'faulty'); // ... B edits later
    await B.engine.syncNow(); // B reaches the server first
    await A.engine.syncNow(); // A's older edit is stale
    await B.engine.syncNow();
    for (const d of [A, B]) assert.equal((await d.repo.listReps('sess-e2e-0001'))[0]!.label, 'faulty');
    assert.equal((await A.repo.listPending()).reps.length, 0);
  });

  await step('the training CSV contains the labelled reps', async () => {
    const token = A.auth.token!;
    const res = await fetch(`${server.base}/api/export.csv?person_id=e2e`, { headers: { Authorization: `Bearer ${token}` } });
    const lines = (await res.text()).trim().split('\n');
    assert.equal(lines[0], 'person_id,rep_id,knee,hip,torso,shank,phi,femur_torso,shank_femur,leg_torso,label');
    assert.equal(lines.length, 4); // header + 3 labelled reps
    assert.ok(lines[1]!.startsWith('e2e,1,60.1235'));
  });

  await step('a deletion on A removes the session on B and on the server', async () => {
    await A.repo.deleteSession('sess-e2e-0001');
    await A.engine.syncNow();
    await B.engine.syncNow();
    assert.equal((await B.repo.listSessions()).length, 0);
    assert.equal((await B.repo.listAllReps()).length, 0);
    const exported = JSON.parse(await A.api.exportJson());
    assert.equal(exported.sessions.length, 0);
    assert.equal(exported.reps.length, 0);
    assert.equal((await A.repo.listPending()).sessions.length, 0); // the tombstone was confirmed and cleared
  });

  await step('a long history syncs in batches and arrives complete', async () => {
    await A.repo.createSession(mkSession('sess-e2e-0002'));
    for (let i = 1; i <= 620; i++) await A.repo.addRep(mkRep(`rep-big-${String(i).padStart(4, '0')}`, 'sess-e2e-0002', i));
    await A.engine.syncNow();
    assert.equal(A.engine.store.getState().pending, 0);
    await B.engine.syncNow();
    assert.equal((await B.repo.listReps('sess-e2e-0002')).length, 620);
  });

  await step('wrong password, duplicate email and bad input give clear errors', async () => {
    const C = device(server.base);
    await assert.rejects(() => C.auth.signIn(email, 'not-the-password'), (e: unknown) => e instanceof ApiError && e.status === 401 && e.code === 'invalid_credentials');
    await assert.rejects(() => C.auth.signUp(email, 'e2e-password-1', null, true), (e: unknown) => e instanceof ApiError && e.status === 409 && e.code === 'email_taken');
    await assert.rejects(() => C.auth.signUp('nope', 'short', null, true), (e: unknown) => e instanceof ApiError && e.status === 422);
  });

  await step('losing the network means "offline", nothing is lost, and sync recovers by itself', async () => {
    const net = { down: false };
    const D = device(server.base, net);
    await signedIn(D, `e2e-offline-${Date.now()}@example.com`, true);
    await D.repo.createSession(mkSession('sess-offline1'));
    await D.repo.addRep(mkRep('rep-offline-1', 'sess-offline1', 1));
    net.down = true;
    await D.engine.syncNow();
    assert.equal(D.engine.store.getState().phase, 'offline');
    assert.equal(D.engine.store.getState().pending, 2);
    assert.equal(D.auth.store.getState().status, 'signed_in'); // being offline never signs you out
    net.down = false;
    await D.engine.syncNow();
    assert.equal(D.engine.store.getState().phase, 'idle');
    assert.equal(D.engine.store.getState().pending, 0);
    assert.equal(JSON.parse(await D.api.exportJson()).reps.length, 1);
  });

  await step('a different account on the same device never sees or receives the previous account\'s data', async () => {
    B.auth.signOut();
    const email2 = `e2e2-${Date.now()}@example.com`;
    await B.auth.signUp(email2, 'e2e-password-2', null, true);
    const result = await B.engine.adoptAccount(B.auth.store.getState().user!.id);
    assert.equal(result, 'reset');
    assert.equal(B.resets.length, 1);
    assert.equal((await B.repo.listAllReps()).length, 0);
    await B.engine.syncNow();
    assert.equal((await B.repo.listSessions()).length, 0);
    assert.equal(JSON.parse(await B.api.exportJson()).reps.length, 0);
  });

  await step('deleting the account removes the data and invalidates the token', async () => {
    const token = A.auth.token!;
    await A.api.deleteAccount('e2e-password-1');
    const res = await fetch(`${server.base}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(res.status, 401);
    await A.engine.syncNow();
    assert.equal(A.auth.store.getState().status, 'signed_out'); // the next sync notices and signs out cleanly
  });

  console.log(`\nAll ${passed} end-to-end checks passed.`);
} catch (e) {
  console.error('\nEND-TO-END FAILURE:', e);
  process.exitCode = 1;
} finally {
  server.stop();
}
