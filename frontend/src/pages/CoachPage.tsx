import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BuildTile } from '@/components/coach/BuildTile';
import { DepthTile } from '@/components/coach/DepthTile';
import { FeaturePanel } from '@/components/coach/FeaturePanel';
import { RepListTile } from '@/components/coach/RepListTile';
import { RepStrip } from '@/components/coach/RepStrip';
import { ScoreTile } from '@/components/coach/ScoreTile';
import { SetControls } from '@/components/coach/SetControls';
import { Sidebar } from '@/components/coach/Sidebar';
import { SourceBar } from '@/components/coach/SourceBar';
import { TempoTile } from '@/components/coach/TempoTile';
import { VideoStage } from '@/components/coach/VideoStage';
import { getRuntime, useCoach } from '@/features/session/defaultRuntime.ts';

/** Live Coach (camera) and Video Review share one layout. */
export function CoachPage({ mode }: { mode: 'live' | 'review' }) {
  const [searchParams] = useSearchParams();
  const reps = useCoach((s) => s.reps);
  const lastRep = useCoach((s) => s.lastRep);
  const saveError = useCoach((s) => s.saveError);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = reps.find((r) => r.id === selectedId) ?? null;
  const shown = selected ?? lastRep;

  const profile = useCoach((s) => s.profile);

  // If no personal profile has been set yet, enable the standard build so live tracking works immediately
  useEffect(() => {
    if (!profile) {
      const rt = getRuntime();
      void (async () => {
        const saved = await rt.repository.loadProfile();
        if (!saved) {
          rt.useAverageBuild();
        }
      })();
    }
  }, [profile]);

  // If redirected with ?calibrate=true (e.g. from Profile page "Calibrate with live camera in Coach")
  useEffect(() => {
    if (searchParams.get('calibrate') === 'true') {
      const rt = getRuntime();
      void (async () => {
        await rt.startCamera();
        rt.startCameraCalibration();
      })();
    }
  }, [searchParams]);

  return (
    <div className="grid gap-3 lg:grid-cols-[104px_1fr]">
      <Sidebar />
      <div className="min-w-0 space-y-3">
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
