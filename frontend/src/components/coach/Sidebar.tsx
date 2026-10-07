import { ExerciseIcon, type ExerciseKind } from '@/components/icons';

const ITEMS: Array<{ kind: ExerciseKind; label: string; active: boolean }> = [
  { kind: 'squat', label: 'Squat', active: true },
  { kind: 'lunge', label: 'Lunge', active: false },
  { kind: 'pushup', label: 'Push-up', active: false },
  { kind: 'deadlift', label: 'Deadlift', active: false },
];

/** Exercise picker. Only the squat exists today; the others are honest placeholders. */
export function Sidebar() {
  return (
    <nav aria-label="Exercises" className="flex gap-2 lg:flex-col">
      {ITEMS.map((it) => (
        <button
          key={it.kind}
          type="button"
          disabled={!it.active}
          aria-current={it.active ? 'true' : undefined}
          title={it.active ? it.label : `${it.label}: coming soon`}
          className={`flex w-24 flex-col items-center gap-1 rounded-3xl px-2 py-3 text-xs font-bold ${
            it.active ? 'bg-borderline text-ink' : 'cursor-not-allowed bg-canvas text-ink-soft opacity-70'
          }`}
        >
          <ExerciseIcon kind={it.kind} />
          {it.label}
          {!it.active && <span className="text-[10px] font-medium">Soon</span>}
        </button>
      ))}
    </nav>
  );
}
