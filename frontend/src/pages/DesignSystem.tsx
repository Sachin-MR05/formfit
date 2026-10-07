import { EnginePlayground } from '@/components/EnginePlayground';
import { EnvCheck } from '@/components/EnvCheck';
import { NotchButton } from '@/components/ui/NotchButton';
import { Pill } from '@/components/ui/Pill';
import { ScoreRing } from '@/components/ui/ScoreRing';
import { Tile } from '@/components/ui/Tile';
import { BAND_LABEL, scoreBand, type ScoreBand } from '@/lib/score';
import { useDemoStore } from '@/store/demo';

const PALETTE = [
  { name: 'Good', cls: 'bg-good', hex: '#D4F28A', use: 'Good form' },
  { name: 'Borderline', cls: 'bg-borderline', hex: '#FFE680', use: 'Borderline' },
  { name: 'Fix', cls: 'bg-fix', hex: '#FF8F7E', use: 'Needs correction' },
  { name: 'Target', cls: 'bg-target', hex: '#BFD9EA', use: 'Your personal target' },
  { name: 'Body', cls: 'bg-body', hex: '#CDB4F0', use: 'Your proportions' },
  { name: 'Sand', cls: 'bg-sand', hex: '#EBCDA8', use: 'Photos / neutral' },
] as const;

const CUE: Record<ScoreBand, string> = {
  good: 'Steady. Good depth.',
  borderline: 'Chest up a little.',
  fix: 'Slow down. Reset your stance.',
};

const BAND_TILE: Record<ScoreBand, string> = {
  good: 'bg-good',
  borderline: 'bg-borderline',
  fix: 'bg-fix',
};

// Demo values only (Phase 0). Real data arrives in Phases 1-2.
const REPS = [92, 88, 61, 90, 85, 79, 87];
const SET_SIZE = 12;
const RATIOS = [
  { value: '0.94', label: 'Femur / Torso' },
  { value: '0.98', label: 'Shank / Femur' },
  { value: '1.86', label: 'Leg / Torso' },
];

function SpeakerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 10v4h4l5 4V6L8 10H4Z" fill="currentColor" />
      <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function DesignSystem() {
  const score = useDemoStore((s) => s.score);
  const setScore = useDemoStore((s) => s.setScore);
  const band = scoreBand(score);

  return (
    <main>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-ink-soft">Phase 1 · design system, scoring engine &amp; environment check</p>
          <h1 className="font-display text-4xl font-black uppercase leading-none sm:text-5xl">FormFit</h1>
        </div>
        <Pill tone="good">v0.1.0 · engine</Pill>
      </div>

      <div className="grid gap-4 md:grid-cols-12">
        {/* Score tile: proves tokens, fonts, Zustand, Framer Motion, notch */}
        <Tile
          tone="good"
          className="md:col-span-5 md:row-span-2"
          notch={{
            corner: 'top-right',
            content: (
              <NotchButton label="Voice coach (demo)" tone="yellow">
                <SpeakerIcon />
              </NotchButton>
            ),
          }}
        >
          <p className="text-sm font-bold uppercase tracking-wide">Last rep</p>
          <div className="mt-3 flex items-center gap-4">
            <ScoreRing score={score} />
            <div>
              <Pill>{BAND_LABEL[band]}</Pill>
              <p className="mt-2 text-sm text-ink-soft">out of 100</p>
            </div>
          </div>
          <label className="mt-4 block text-sm font-medium" htmlFor="demo-score">
            Try the score: {Math.round(score)}
          </label>
          <input
            id="demo-score"
            type="range"
            min={0}
            max={100}
            value={score}
            onChange={(e) => setScore(Number(e.target.value))}
            className="mt-1 w-full accent-black"
          />
          <p className="mt-5 text-xs font-bold uppercase tracking-wide">Coach says</p>
          <p className="font-display text-3xl font-black uppercase leading-tight">{CUE[band]}</p>
        </Tile>

        <Tile tone="target" className="md:col-span-7">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-bold uppercase tracking-wide">Depth</p>
            <p className="text-sm text-ink-soft">target: parallel or below</p>
          </div>
          <p className="mt-2 font-display text-5xl font-black">
            80<span className="text-2xl">%</span>
          </p>
          <div className="mt-3 h-3 overflow-hidden rounded-pill bg-white/60" role="presentation">
            <div className="h-full w-4/5 rounded-pill bg-good" />
          </div>
        </Tile>

        <Tile tone="body" className="md:col-span-7">
          <p className="text-sm font-bold uppercase tracking-wide">
            Your build <span className="font-normal normal-case text-ink-soft">(demo values)</span>
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {RATIOS.map((r) => (
              <div key={r.label} className="rounded-2xl bg-white/60 px-2 py-3 text-center">
                <div className="font-display text-xl font-black">{r.value}</div>
                <div className="text-xs text-ink-soft">{r.label}</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-sm">
            Your balanced torso lean range: <b className="font-display">25° – 43°</b>
          </p>
        </Tile>

        <Tile tone="sand" className="md:col-span-7">
          <p className="text-sm font-bold uppercase tracking-wide">
            Rep strip <span className="font-normal normal-case text-ink-soft">(tap a rep to replay)</span>
          </p>
          <ol className="mt-3 flex flex-wrap gap-2" aria-label="Reps in this set">
            {Array.from({ length: SET_SIZE }, (_, i) => {
              const s = REPS[i];
              if (s === undefined) {
                return (
                  <li
                    key={i}
                    className="grid h-12 w-12 place-items-center rounded-full border-2 border-dashed border-black/25 text-sm text-ink-soft"
                  >
                    {i + 1}
                  </li>
                );
              }
              const b = scoreBand(s);
              return (
                <li
                  key={i}
                  title={`Rep ${i + 1}: ${s} (${BAND_LABEL[b]})`}
                  className={`grid h-12 w-12 place-items-center rounded-full text-center text-xs font-bold leading-tight ${BAND_TILE[b]}`}
                >
                  <span>
                    <span className="block text-[10px] font-medium">{i + 1}</span>
                    {s}
                  </span>
                </li>
              );
            })}
          </ol>
        </Tile>

        <Tile tone="white" className="border border-black/5 md:col-span-5">
          <p className="text-sm font-bold uppercase tracking-wide">Colour tokens</p>
          <ul className="mt-3 grid grid-cols-2 gap-2">
            {PALETTE.map((c) => (
              <li key={c.name} className="flex items-center gap-2">
                <span className={`h-9 w-9 shrink-0 rounded-xl border border-black/10 ${c.cls}`} />
                <span className="text-xs leading-tight">
                  <b>{c.name}</b> <span className="text-ink-soft">{c.hex}</span>
                  <br />
                  <span className="text-ink-soft">{c.use}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-soft">
            Colour never stands alone: always pair it with an icon and a word.
          </p>
        </Tile>

        <Tile tone="white" className="border border-black/5 md:col-span-7">
          <p className="text-sm font-bold uppercase tracking-wide">Typography &amp; pills</p>
          <p className="mt-2 font-display text-3xl font-black uppercase leading-tight">Squat for your body.</p>
          <p className="mt-1 text-sm text-ink-soft">
            Body text uses Inter; headlines use Unbounded (self-hosted via Fontsource).
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Pill selected>Depth</Pill>
            <Pill>Torso</Pill>
            <Pill>Knees</Pill>
            <Pill tone="target">Tempo</Pill>
            <Pill tone="body">Balance</Pill>
          </div>
        </Tile>

        <Tile tone="sand" className="md:col-span-12">
          <p className="mb-1 text-sm font-bold uppercase tracking-wide">Engine playground · Phase 1</p>
          <p className="mb-3 text-sm text-ink-soft">
            The TypeScript engine running the model exported from Python. Change the body proportions and watch the personal target,
            the scores and the fixed rule disagree.
          </p>
          <EnginePlayground />
        </Tile>

        <Tile tone="white" className="border border-black/5 md:col-span-12">
          <p className="mb-3 text-sm font-bold uppercase tracking-wide">Environment check</p>
          <EnvCheck />
        </Tile>
      </div>
    </main>
  );
}
