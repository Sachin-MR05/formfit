import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pill } from '@/components/ui/Pill';
import { Tile } from '@/components/ui/Tile';
import { getRuntime } from '@/features/session/defaultRuntime.ts';
import { repsToCsv } from '@/features/session/repository.ts';
import { useLocalData } from '@/features/session/useLocalData.ts';
import { summarizeSessions } from '@/features/stats/stats.ts';
import { getSync } from '@/features/sync/defaultSync.ts';
import { formatDate } from '@/lib/format';
import { scoreBand } from '@/lib/score';
import { usePageTitle } from '@/lib/usePageTitle';

const BAND_TONE = { good: 'good', borderline: 'borderline', fix: 'fix' } as const;
type Filter = 'all' | 'live' | 'upload';

function download(filename: string, text: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Everything saved on this device (and synced in from your account). */
export function HistoryPage() {
  usePageTitle('History');
  const repo = getRuntime().repository;
  const { data, error, reload } = useLocalData();
  const [personId, setPersonId] = useState('p01');
  const [filter, setFilter] = useState<Filter>('all');

  const rows = useMemo(() => (data ? summarizeSessions(data.sessions, data.reps).filter((s) => filter === 'all' || s.source === filter) : []), [data, filter]);
  const labelled = data?.reps.filter((r) => r.label !== null).length ?? 0;
  const totalReps = data?.reps.length ?? 0;
  const overall = totalReps ? Math.round((data?.reps ?? []).reduce((a, r) => a + r.score, 0) / totalReps) : null;

  const remove = async (id: string) => {
    if (!confirm('Delete this session and its reps? It is removed from your account too.')) return;
    await repo.deleteSession(id);
    await reload();
    getSync().engine.schedule(500);
  };

  return (
    <main className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-4xl font-black uppercase leading-none">History</h1>
        <div className="flex gap-2" role="group" aria-label="Filter sessions">
          <Pill selected={filter === 'all'} onClick={() => setFilter('all')}>All</Pill>
          <Pill selected={filter === 'live'} onClick={() => setFilter('live')}>Live</Pill>
          <Pill selected={filter === 'upload'} onClick={() => setFilter('upload')}>Videos</Pill>
        </div>
      </div>

      {error && <p role="alert" className="rounded-2xl bg-fix/40 px-4 py-2 text-sm">Could not read saved sessions: {error}</p>}

      <div className="grid gap-3 sm:grid-cols-3">
        <Tile tone="good"><p className="text-xs font-extrabold uppercase">Sessions</p><p className="font-display text-4xl font-black">{data?.sessions.length ?? '–'}</p></Tile>
        <Tile tone="target"><p className="text-xs font-extrabold uppercase">Reps</p><p className="font-display text-4xl font-black">{data ? totalReps : '–'}</p></Tile>
        <Tile tone="body"><p className="text-xs font-extrabold uppercase">Average score</p><p className="font-display text-4xl font-black">{overall ?? '–'}</p></Tile>
      </div>

      <Tile tone="white" className="border border-black/5">
        {data && rows.length === 0 ? (
          <p className="text-sm text-ink-soft">No sessions here yet. Finish a set in Live Coach or analyse a video and it will appear.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Saved sessions, newest first</caption>
              <thead className="text-xs uppercase text-ink-soft">
                <tr><th scope="col" className="py-1 pr-3">When</th><th scope="col" className="py-1 pr-3">Source</th><th scope="col" className="py-1 pr-3">Reps</th><th scope="col" className="py-1 pr-3">Average</th><th scope="col" className="py-1 pr-3">Judged good</th><th scope="col" className="py-1 pr-3">Cloud</th><th scope="col"><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} className="border-t border-black/5">
                    <td className="py-2 pr-3"><Link to={`/history/${s.id}`} className="font-medium underline">{formatDate(s.startedAt)}</Link></td>
                    <td className="py-2 pr-3">{s.source === 'live' ? 'Live camera' : `Video: ${s.fileName ?? ''}`}</td>
                    <td className="py-2 pr-3">{s.reps}</td>
                    <td className="py-2 pr-3">{s.avg === null ? '–' : <Pill tone={BAND_TONE[scoreBand(s.avg)]}>{Math.round(s.avg)}</Pill>}</td>
                    <td className="py-2 pr-3">{s.passed}/{s.reps}</td>
                    <td className="py-2 pr-3 text-xs text-ink-soft">{s.pending ? 'Waiting to upload' : 'Uploaded'}</td>
                    <td className="py-2 text-right"><button type="button" onClick={() => void remove(s.id)} className="min-h-[44px] px-2 text-xs font-medium text-red-700 underline">Delete</button></td>
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
          Reps you labelled Good / Faulty ({labelled} so far) can be exported for retraining with <code>python ml/scripts/export_for_frontend.py --csv file.csv</code>.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="text-sm">Person ID <input value={personId} onChange={(e) => setPersonId(e.target.value)} className="w-24 rounded-lg border border-black/15 bg-white px-2 py-1.5" /></label>
          <button type="button" disabled={labelled === 0} onClick={() => download('squat_labelled_reps.csv', repsToCsv(data?.reps ?? [], personId.trim() || 'p01'))} className="rounded-pill bg-ink px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Download CSV</button>
        </div>
      </Tile>
    </main>
  );
}
