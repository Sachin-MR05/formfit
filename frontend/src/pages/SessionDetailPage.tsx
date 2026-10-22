import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BarChart } from '@/components/charts/BarChart';
import { fillForScore } from '@/components/charts/colors';
import { LineChart } from '@/components/charts/LineChart';
import { PoseSnapshot } from '@/components/PoseSnapshot';
import { Pill } from '@/components/ui/Pill';
import { Tile } from '@/components/ui/Tile';
import { engine } from '@/engine/loader.ts';
import { coach, GOOD_MIN } from '@/engine/index.ts';
import { getRuntime } from '@/features/session/defaultRuntime.ts';
import { useLocalData } from '@/features/session/useLocalData.ts';
import { CUE_CODES, faultCounts } from '@/features/stats/stats.ts';
import { getSync } from '@/features/sync/defaultSync.ts';
import { formatDate } from '@/lib/format';
import { BAND_LABEL, scoreBand } from '@/lib/score';
import { usePageTitle } from '@/lib/usePageTitle';
import type { RepLabel } from '@/features/session/types.ts';

const FAULT_LABEL = {
  torso_forward: 'Chest folding forward',
  torso_upright: 'Too upright',
  knee_travel: 'Knees travelling far forward',
  depth_short: 'Not deep enough',
} as const;

const avg = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** One session: charts across the reps, and a per-rep inspector comparing what you did with YOUR balanced target. */
export function SessionDetailPage() {
  usePageTitle('Session');
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const runtime = getRuntime();
  const { data, reload } = useLocalData();
  const [pick, setPick] = useState<string | null>(null);

  const session = data?.sessions.find((s) => s.id === id) ?? null;
  const reps = useMemo(() => (data ? data.reps.filter((r) => r.sessionId === id).sort((a, b) => a.index - b.index) : []), [data, id]);
  const selected = reps.find((r) => r.id === pick) ?? reps[reps.length - 1] ?? null;
  const verdicts = useMemo(() => reps.map((r) => coach(engine.config, r.features, r.profile, 'rep')), [reps]);
  const verdict = selected ? verdicts[reps.indexOf(selected)]! : null;

  if (!data) return <p className="text-sm text-ink-soft" role="status">Loading…</p>;
  if (!session) {
    return (
      <Tile tone="sand" className="max-w-xl">
        <p className="font-semibold">That session is not on this device (it may have been deleted).</p>
        <Link to="/history" className="mt-3 inline-block rounded-pill bg-ink px-5 py-2.5 text-sm font-semibold text-white">Back to history</Link>
      </Tile>
    );
  }

  const scores = reps.map((r) => r.score);
  const average = avg(scores);
  const faults = faultCounts(reps);
  const label = async (repId: string, value: RepLabel) => {
    await runtime.repository.setRepLabel(repId, value);
    await reload();
    getSync().engine.schedule(1000);
  };
  const remove = async () => {
    if (!confirm('Delete this session and its reps? It is removed from your account too.')) return;
    await runtime.repository.deleteSession(session.id);
    getSync().engine.schedule(500);
    navigate('/history');
  };

  return (
    <main className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/history" className="text-sm font-medium text-ink-soft underline">All sessions</Link>
          <h1 className="font-display text-3xl font-black uppercase leading-none">{formatDate(session.startedAt)}</h1>
          <p className="text-sm text-ink-soft">{session.source === 'live' ? 'Live camera' : `Video: ${session.fileName ?? ''}`} · pose model {session.poseModel}</p>
        </div>
        <button type="button" onClick={() => void remove()} className="min-h-[44px] rounded-pill bg-white px-5 text-sm font-semibold text-red-700 ring-1 ring-black/10">Delete session</button>
      </div>

      {reps.length === 0 ? (
        <Tile tone="sand"><p className="text-sm">This session has no scored reps.</p></Tile>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile tone="good"><p className="text-xs font-extrabold uppercase">Reps</p><p className="font-display text-4xl font-black">{reps.length}</p></Tile>
            <Tile tone={average !== null && average >= GOOD_MIN ? 'good' : 'borderline'}><p className="text-xs font-extrabold uppercase">Average</p><p className="font-display text-4xl font-black">{Math.round(average ?? 0)}</p></Tile>
            <Tile tone="target"><p className="text-xs font-extrabold uppercase">Best / worst</p><p className="font-display text-4xl font-black">{Math.max(...scores)} <span className="text-xl text-ink-soft">/ {Math.min(...scores)}</span></p></Tile>
            <Tile tone="body"><p className="text-xs font-extrabold uppercase">Average tempo</p><p className="font-display text-3xl font-black">{(avg(reps.map((r) => r.downS)) ?? 0).toFixed(1)}s ↓ {(avg(reps.map((r) => r.upS)) ?? 0).toFixed(1)}s ↑</p></Tile>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Tile tone="white" className="border border-black/5">
              <p className="mb-2 text-xs font-extrabold uppercase tracking-wide">Score per rep (a falling slope means fatigue)</p>
              <BarChart label="Form score for each rep" bars={reps.map((r) => ({ value: r.score, label: String(r.index), fill: fillForScore(r.score) }))} max={100} reference={{ value: GOOD_MIN, name: `Good form from ${GOOD_MIN}` }} />
            </Tile>
            <Tile tone="white" className="border border-black/5">
              <p className="mb-2 text-xs font-extrabold uppercase tracking-wide">Tempo: time going down (wide) and up (narrow), seconds</p>
              <BarChart label="Descent and ascent time for each rep" bars={reps.map((r) => ({ value: r.downS, value2: r.upS, label: String(r.index), fill: '#bfd9ea' }))} unit="s" />
            </Tile>
            <Tile tone="white" className="border border-black/5 lg:col-span-2">
              <p className="mb-2 text-xs font-extrabold uppercase tracking-wide">Torso lean relative to YOUR balanced target (0 = perfect; shaded = within your range)</p>
              <LineChart
                label="Torso lean minus your balanced target, per rep"
                points={reps.map((r, i) => ({ x: r.index, y: verdicts[i]!.diff, label: `Rep ${r.index}` }))}
                band={{ lo: -engine.config.torsoTol, hi: engine.config.torsoTol, name: 'Within your range' }}
                yDomain={[-30, 30]}
                unit="°"
              />
            </Tile>
          </div>

          <Tile tone="sand">
            <p className="text-xs font-extrabold uppercase tracking-wide">What came up in this session</p>
            {CUE_CODES.every((c) => faults[c] === 0) ? (
              <p className="mt-2 text-sm">No faults flagged. Clean session.</p>
            ) : (
              <ul className="mt-2 flex flex-wrap gap-2">
                {CUE_CODES.filter((c) => faults[c] > 0).map((c) => <li key={c}><Pill tone="borderline">{FAULT_LABEL[c]} · {faults[c]} {faults[c] === 1 ? 'rep' : 'reps'}</Pill></li>)}
              </ul>
            )}
          </Tile>

          {selected && verdict && (
            <Tile tone="white" className="border border-black/5">
              <p className="text-xs font-extrabold uppercase tracking-wide">Rep inspector</p>
              <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Choose a rep">
                {reps.map((r) => (
                  <button key={r.id} type="button" aria-pressed={r.id === selected.id} onClick={() => setPick(r.id)}
                    className={`grid h-11 w-11 place-items-center rounded-full text-xs font-bold ${r.id === selected.id ? 'outline-[3px] outline-offset-1 outline-ink' : ''}`} style={{ background: fillForScore(r.score) }}>
                    {r.index}
                  </button>
                ))}
              </div>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <div>
                  <PoseSnapshot profile={selected.profile} alpha={selected.features.shank} phi={selected.features.phi} tau={selected.features.torso} target={verdict.target} ok={verdict.torso === 'ok'} />
                  <p className="mt-1 text-xs text-ink-soft">Bottom position of rep {selected.index}. Solid = what you did. Dashed = the balanced torso for your proportions at that depth.</p>
                </div>
                <div className="space-y-2 text-sm">
                  <p><b className="font-display text-3xl">{selected.score}</b> <span className="text-ink-soft">/100 · {BAND_LABEL[scoreBand(selected.score)]}</span></p>
                  <p>Torso {selected.features.torso.toFixed(0)}° vs your target {verdict.target.toFixed(0)}° · knee {selected.features.knee.toFixed(0)}° · depth {selected.features.phi <= engine.config.depthPhiOk ? 'reached' : 'not reached'}</p>
                  <p className="text-ink-soft">Tempo {selected.downS.toFixed(1)}s down, {selected.upS.toFixed(1)}s up</p>
                  <p>Generic model: <b>{Math.round(selected.generic * 100)}</b> · Fixed rule: <b>{selected.ruleOk ? 'pass' : `fail (${selected.ruleReasons.join(', ')})`}</b></p>
                  {verdict.cues.length === 0 ? <p className="font-medium text-green-800">✓ Form matched your proportions.</p> : <ul className="list-disc pl-5">{verdict.cues.map((c) => <li key={c.code}>{c.text}</li>)}</ul>}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="text-ink-soft">Coach label:</span>
                    {(['good', 'faulty'] as const).map((l) => (
                      <button key={l} type="button" aria-pressed={selected.label === l} onClick={() => void label(selected.id, selected.label === l ? null : l)}
                        className={`min-h-[44px] rounded-pill border px-4 font-semibold ${selected.label === l ? 'border-transparent bg-ink text-white' : 'border-black/15 bg-white'}`}>{l === 'good' ? 'Good' : 'Faulty'}</button>
                    ))}
                  </div>
                </div>
              </div>
            </Tile>
          )}
        </>
      )}
    </main>
  );
}
