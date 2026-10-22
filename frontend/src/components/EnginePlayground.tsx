import { useMemo, useState } from 'react';
import { engine } from '@/engine/loader.ts';
import {
  BAND_LABEL,
  coach,
  poseAngles,
  scoreRep,
  shankTorso,
  type BodyProfile,
} from '@/engine/index.ts';
import { PoseSnapshot } from '@/components/PoseSnapshot';
import { Pill } from '@/components/ui/Pill';

interface Params {
  femurTorso: number;
  shankFemur: number;
  alpha: number; // shin lean (deg)
  phi: number; // thigh elevation (deg), 0 = parallel
  tau: number; // torso lean (deg)
}

const PRESETS: Record<string, Params> = {
  'Average build': { femurTorso: 0.85, shankFemur: 1.0, alpha: 36, phi: -4, tau: 30 },
  'Long femur': { femurTorso: 1.05, shankFemur: 1.0, alpha: 30, phi: -4, tau: 42 },
  'Short femur': { femurTorso: 0.7, shankFemur: 1.0, alpha: 36, phi: -4, tau: 18 },
};

const SLIDERS: Array<{ key: keyof Params; label: string; min: number; max: number; step: number; unit: string }> = [
  { key: 'femurTorso', label: 'Femur / torso', min: 0.65, max: 1.1, step: 0.01, unit: '' },
  { key: 'shankFemur', label: 'Shank / femur', min: 0.85, max: 1.15, step: 0.01, unit: '' },
  { key: 'alpha', label: 'Shin lean (ankle mobility)', min: 20, max: 56, step: 1, unit: '°' },
  { key: 'phi', label: 'Depth (thigh elevation, 0 = parallel)', min: -25, max: 30, step: 1, unit: '°' },
  { key: 'tau', label: 'Torso lean', min: 0, max: 70, step: 1, unit: '°' },
];

export function EnginePlayground() {
  const [p, setP] = useState<Params>(PRESETS['Long femur']!);

  const r = useMemo(() => {
    const profile: BodyProfile = {
      femurTorso: p.femurTorso,
      shankFemur: p.shankFemur,
      legTorso: p.femurTorso * (1 + p.shankFemur),
      upSign: -1,
    };
    const angles = poseAngles(p.femurTorso, shankTorso(profile), p.alpha, p.phi, p.tau);
    const features = { knee: angles.knee, hip: angles.hip, torso: p.tau, shank: p.alpha, phi: p.phi };
    return {
      profile,
      features,
      score: scoreRep(engine, features, profile),
      verdict: coach(engine.config, features, profile, 'rep'),
    };
  }, [p]);

  const set = (key: keyof Params, value: number) => setP((prev) => ({ ...prev, [key]: value }));
  const { metrics } = engine.meta;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {Object.keys(PRESETS).map((name) => (
          <Pill key={name} onClick={() => setP(PRESETS[name]!)}>
            {name}
          </Pill>
        ))}
        <Pill tone="body" onClick={() => set('tau', Math.round(r.verdict.target))}>
          Set torso to my target
        </Pill>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          {SLIDERS.map((s) => (
            <div key={s.key}>
              <label htmlFor={`pg-${s.key}`} className="flex justify-between text-sm font-medium">
                <span>{s.label}</span>
                <span className="font-mono">
                  {p[s.key].toFixed(s.step < 1 ? 2 : 0)}
                  {s.unit}
                </span>
              </label>
              <input
                id={`pg-${s.key}`}
                type="range"
                min={s.min}
                max={s.max}
                step={s.step}
                value={p[s.key]}
                onChange={(e) => set(s.key, Number(e.target.value))}
                className="w-full accent-black"
              />
            </div>
          ))}
          <p className="text-xs text-ink-soft">
            Knee {r.features.knee.toFixed(0)}° · hip {r.features.hip.toFixed(0)}° (derived from the geometry).
          </p>
        </div>

        <div>
          <PoseSnapshot profile={r.profile} alpha={p.alpha} phi={p.phi} tau={p.tau} target={r.verdict.target} ok={r.verdict.torso === 'ok'} />
          <p className="mt-1 text-xs text-ink-soft">
            Solid = your pose. Dashed cyan = balanced torso for <b>this</b> body at this depth.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-good p-3">
          <p className="text-xs font-bold uppercase">Personalized model</p>
          <p className="font-display text-3xl font-black">{r.score.score}</p>
          <p className="text-sm">{BAND_LABEL[r.score.band]}</p>
        </div>
        <div className="rounded-2xl bg-target p-3">
          <p className="text-xs font-bold uppercase">Generic model (angles only)</p>
          <p className="font-display text-3xl font-black">{Math.round(r.score.generic * 100)}</p>
          <p className="text-sm">{r.score.generic >= 0.5 ? 'Passes' : 'Fails'}</p>
        </div>
        <div className={`rounded-2xl p-3 ${r.score.ruleOk ? 'bg-good' : 'bg-fix'}`}>
          <p className="text-xs font-bold uppercase">Fixed rule (one size fits all)</p>
          <p className="font-display text-3xl font-black">{r.score.ruleOk ? 'PASS' : 'FAIL'}</p>
          <p className="text-sm">{r.score.ruleOk ? 'All thresholds met' : r.score.ruleReasons.join(', ')}</p>
        </div>
      </div>

      <div className="mt-3 rounded-2xl bg-body/60 p-3 text-sm" aria-live="polite">
        <b>Your balanced torso lean here: {r.verdict.target.toFixed(0)}°</b> (you: {p.tau}°, tolerance ±{engine.config.torsoTol}°;
        a fixed rule allows ≤ {engine.config.genericTorsoMax}° for everyone).
        {r.verdict.cues.length === 0 ? (
          <span className="ml-1 font-medium">✓ Form matches this body.</span>
        ) : (
          <ul className="mt-1 list-disc pl-5">
            {r.verdict.cues.map((c) => (
              <li key={c.code}>
                {c.text} <span className="text-ink-soft">(voice: “{c.spoken}”)</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-3 text-xs text-ink-soft">
        Model <b className="font-mono">{engine.modelVersion}</b> · trained on <b>{engine.meta.dataSource}</b> data (
        {engine.meta.nPeople} people, {engine.meta.nReps} reps) · held-out accuracy: personalized{' '}
        {((metrics['accuracy_personalized'] ?? 0) * 100).toFixed(0)}% · generic {((metrics['accuracy_generic'] ?? 0) * 100).toFixed(0)}% ·
        fixed rule {((metrics['accuracy_rule'] ?? 0) * 100).toFixed(0)}%.
        {engine.meta.dataSource === 'synthetic' && ' Synthetic data demonstrates the method; real coach-labelled reps are needed for real evidence.'}
      </p>
    </div>
  );
}
