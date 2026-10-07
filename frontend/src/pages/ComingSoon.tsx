import { Link } from 'react-router-dom';
import { Tile } from '@/components/ui/Tile';

export function ComingSoon({ title, note }: { title: string; note: string }) {
  return (
    <Tile tone="sand" className="mx-auto max-w-xl">
      <p className="text-xs font-extrabold uppercase tracking-wide">Coming soon</p>
      <h1 className="mt-1 font-display text-3xl font-black uppercase">{title}</h1>
      <p className="mt-2 text-sm text-ink-soft">{note}</p>
      <Link to="/coach" className="mt-4 inline-block rounded-pill bg-ink px-4 py-2 text-sm font-semibold text-white">
        Back to Live Coach
      </Link>
    </Tile>
  );
}
