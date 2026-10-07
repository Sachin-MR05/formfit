import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pill } from '@/components/ui/Pill';
import { Tile } from '@/components/ui/Tile';
import { getRuntime } from '@/features/session/defaultRuntime.ts';
import { repsToCsv } from '@/features/session/repository.ts';
import type { StoredRep, StoredSession } from '@/features/session/types.ts';
import { scoreBand } from '@/lib/score';
import { formatDate } from '@/lib/format';

const BAND_TONE = { good: 'good', borderline: 'borderline', fix: 'fix' } as const;

function download(filename: string, text: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Everything saved on this device. Phase 4 adds syncing it to your account. */
export function HistoryPage() {
  const repo = getRuntime().repository;
  const [data, setData] = useState<{ sessions: StoredSession[]; reps: StoredRep[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [personId, setPersonId] = useState('p01');

  const load = useCallback(async () => {
    try {
      const [sessions, reps] = await Promise.all([repo.listSessions(), repo.listAllReps()]);
      setData({ sessions, reps });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [repo]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    if (!data) return [];
    return data.sessions.map((s) => {
      const reps = data.reps.filter((r) => r.sessionId === s.id);
      const avg = reps.length ? Math.round(reps.reduce((a, r) => a + r.score, 0) / reps.length) : null;
      return { s, count: reps.length, avg, good: reps.filter((r) => r.score >= 50).length };
    });
  }, [data]);

  const labelled = data?.reps.filter((r) => r.label !== null).length ?? 0;
  const totalReps = data?.reps.length ?? 0;
  const overall = totalReps ? Math.round((data?.reps ?? []).reduce((a, r) => a + r.score, 0) / totalReps) : null;

  return (
    <main className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-4xl font-black uppercase leading-none">History</h1>
        <p className="text-sm text-ink-soft">Saved on this device only.</p>
      </div>

      {error && (
        <p role="alert" className="rounded-2xl bg-fix/40 px-4 py-2 text-sm">
          Could not read saved sessions: {error}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Tile tone="good">
          <p className="text-xs font-extrabold uppercase">Sessions</p>
          <p className="font-display text-4xl font-black">{data?.sessions.length ?? '–'}</p>
        </Tile>
        <Tile tone="target">
          <p className="text-xs font-extrabold uppercase">Reps</p>
          <p className="font-display text-4xl font-black">{data ? totalReps : '–'}</p>
        </Tile>
        <Tile tone="body">
          <p className="text-xs font-extrabold uppercase">Average score</p>
          <p className="font-display text-4xl font-black">{overall ?? '–'}</p>
        </Tile>
      </div>

      <Tile tone="white" className="border border-black/5">
        {data && rows.length === 0 ? (
          <p className="text-sm text-ink-soft">No sessions yet. Finish a set in Live Coach or analyse a video, and it will appear here.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-ink-soft">
                <tr>
                  <th className="py-1 pr-3">When</th>
                  <th className="py-1 pr-3">Source</th>
                  <th className="py-1 pr-3">Reps</th>
                  <th className="py-1 pr-3">Average</th>
                  <th className="py-1 pr-3">Good</th>
                  <th className="py-1 pr-3">Model</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ s, count, avg, good }) => (
                  <tr key={s.id} className="border-t border-black/5">
                    <td className="py-2 pr-3">{formatDate(s.startedAt)}</td>
                    <td className="py-2 pr-3">{s.source === 'live' ? 'Live camera' : `Video: ${s.fileName ?? ''}`}</td>
                    <td className="py-2 pr-3">{count}</td>
                    <td className="py-2 pr-3">{avg === null ? '–' : <Pill tone={BAND_TONE[scoreBand(avg)]}>{avg}</Pill>}</td>
                    <td className="py-2 pr-3">
                      {good}/{count}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs text-ink-soft">{s.modelVersion}</td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm('Delete this session and its reps from this device?')) void repo.deleteSession(s.id).then(load);
                        }}
                        className="text-xs font-medium text-red-700 underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tile>

      <Tile tone="sand">
        <p className="text-xs font-extrabold uppercase tracking-wide">Training data export</p>
        <p className="mt-1 text-sm text-ink-soft">
          Reps you labelled Good / Faulty in Live Coach ({labelled} so far) can be exported for retraining with{' '}
          <code>python ml/scripts/export_for_frontend.py --csv file.csv</code>.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="text-sm">
            Person ID{' '}
            <input value={personId} onChange={(e) => setPersonId(e.target.value)} className="w-24 rounded-lg border border-black/15 bg-white px-2 py-1" />
          </label>
          <button
            type="button"
            disabled={labelled === 0}
            onClick={() => download('squat_labelled_reps.csv', repsToCsv(data?.reps ?? [], personId.trim() || 'p01'))}
            className="rounded-pill bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            Download CSV
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirm('Delete ALL saved sessions, reps and your saved body profile from this device?')) void repo.clearAll().then(load);
            }}
            className="ml-auto text-sm font-medium text-red-700 underline"
          >
            Delete all my data
          </button>
        </div>
      </Tile>
    </main>
  );
}
