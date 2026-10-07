import { useState } from 'react';
import { BuildTile } from '@/components/coach/BuildTile';
import { DepthTile } from '@/components/coach/DepthTile';
import { FeaturePanel } from '@/components/coach/FeaturePanel';
import { PersonalizeCard } from '@/components/coach/PersonalizeCard';
import { RepListTile } from '@/components/coach/RepListTile';
import { RepStrip } from '@/components/coach/RepStrip';
import { ScoreTile } from '@/components/coach/ScoreTile';
import { SetControls } from '@/components/coach/SetControls';
import { Sidebar } from '@/components/coach/Sidebar';
import { SourceBar } from '@/components/coach/SourceBar';
import { TempoTile } from '@/components/coach/TempoTile';
import { VideoStage } from '@/components/coach/VideoStage';
import { useCoach } from '@/features/session/defaultRuntime.ts';

/** Live Coach (camera) and Video Review share one layout; only Step 2 differs. */
export function CoachPage({ mode }: { mode: 'live' | 'review' }) {
  const reps = useCoach((s) => s.reps);
  const lastRep = useCoach((s) => s.lastRep);
  const saveError = useCoach((s) => s.saveError);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = reps.find((r) => r.id === selectedId) ?? null;
  const shown = selected ?? lastRep;

  return (
    <div className="grid gap-3 lg:grid-cols-[104px_1fr]">
      <Sidebar />
      <div className="min-w-0 space-y-3">
        <PersonalizeCard />
        <SourceBar mode={mode} />
        {saveError && (
          <p role="alert" className="rounded-2xl bg-fix/40 px-4 py-2 text-sm">
            {saveError} (coaching continues; this device may be blocking local storage).
          </p>
        )}

        <div className="grid gap-3 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <VideoStage />
          </div>
          <div className="lg:col-span-3">
            <ScoreTile rep={shown} />
          </div>
          <div className="lg:col-span-3">
            <RepListTile selectedId={selected?.id ?? null} onSelect={(id) => setSelectedId((cur) => (cur === id ? null : id))} />
          </div>

          <div className="lg:col-span-4">
            <DepthTile lastRep={shown} />
          </div>
          <div className="lg:col-span-5">
            <BuildTile />
          </div>
          <div className="lg:col-span-3">
            <TempoTile />
          </div>

          <div className="lg:col-span-8">
            <RepStrip selectedId={selected?.id ?? null} onSelect={(id) => setSelectedId((cur) => (cur === id ? null : id))} />
          </div>
          <div className="lg:col-span-4">
            <SetControls />
          </div>
        </div>

        <details className="rounded-tile bg-white p-4">
          <summary className="cursor-pointer text-xs font-extrabold uppercase tracking-wide">Real-time input features (what the model sees)</summary>
          <div className="mt-3">
            <FeaturePanel />
          </div>
        </details>
      </div>
    </div>
  );
}
