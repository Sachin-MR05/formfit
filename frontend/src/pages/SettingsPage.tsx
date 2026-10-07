import { Link } from 'react-router-dom';
import { Pill } from '@/components/ui/Pill';
import { Tile } from '@/components/ui/Tile';
import { getRuntime, getVoice, useVoice } from '@/features/session/defaultRuntime.ts';
import type { VoiceStyle } from '@/features/voice/types.ts';

const STYLES: Array<{ id: VoiceStyle; label: string; hint: string }> = [
  { id: 'calm', label: 'Calm', hint: 'Short and neutral: "Seven. Chest up."' },
  { id: 'motivating', label: 'Motivating', hint: 'Encouraging: "Seven. Chest up, you have got this!"' },
  { id: 'count', label: 'Count only', hint: 'Just the rep count and a set summary.' },
];

export function SettingsPage() {
  const voice = getVoice();
  const settings = useVoice((s) => s.settings);
  const voices = useVoice((s) => s.voices);
  const supported = useVoice((s) => s.supported);
  const canVibrate = typeof navigator !== 'undefined' && 'vibrate' in navigator;

  return (
    <main className="space-y-3">
      <h1 className="font-display text-4xl font-black uppercase leading-none">Settings</h1>

      <Tile tone="good">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xs font-extrabold uppercase tracking-wide">Voice coaching</h2>
            <p className="mt-1 text-sm text-ink-soft">
              After each rep the coach says the count and at most one correction. During the descent it only speaks up for urgent safety issues.
            </p>
          </div>
          <button
            type="button"
            aria-pressed={settings.enabled}
            disabled={!supported}
            onClick={() => voice.coach.setEnabled(!settings.enabled)}
            className={`rounded-pill px-6 py-3 text-sm font-extrabold ${settings.enabled ? 'bg-ink text-white' : 'bg-white text-ink'} disabled:opacity-50`}
          >
            {settings.enabled ? 'Voice is ON' : 'Voice is OFF'}
          </button>
        </div>
        {!supported && (
          <p role="alert" className="mt-3 rounded-2xl bg-white/70 px-3 py-2 text-sm">
            This browser has no speech synthesis, so the coach cannot speak. On-screen captions and vibration still work.
          </p>
        )}

        <fieldset className="mt-4">
          <legend className="text-xs font-extrabold uppercase tracking-wide">Style</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {STYLES.map((st) => (
              <Pill key={st.id} selected={settings.style === st.id} onClick={() => voice.update({ style: st.id })}>
                {st.label}
              </Pill>
            ))}
          </div>
          <p className="mt-1 text-sm text-ink-soft">{STYLES.find((st) => st.id === settings.style)?.hint}</p>
        </fieldset>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            Volume: {Math.round(settings.volume * 100)}%
            <input type="range" min={0} max={100} value={Math.round(settings.volume * 100)} onChange={(e) => voice.update({ volume: Number(e.target.value) / 100 })} className="mt-1 w-full accent-black" />
          </label>
          <label className="block text-sm font-medium">
            Speed: {settings.rate.toFixed(2)}×
            <input type="range" min={70} max={140} value={Math.round(settings.rate * 100)} onChange={(e) => voice.update({ rate: Number(e.target.value) / 100 })} className="mt-1 w-full accent-black" />
          </label>
        </div>

        <label className="mt-4 block text-sm font-medium">
          Voice
          <select
            value={settings.voiceURI ?? ''}
            onChange={(e) => voice.update({ voiceURI: e.target.value || null })}
            className="mt-1 block w-full max-w-md rounded-lg border border-black/15 bg-white px-2 py-1.5"
          >
            <option value="">Automatic (best match for your browser language)</option>
            {voices.map((v) => (
              <option key={v.uri} value={v.uri}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
          {voices.length === 0 && supported && <span className="mt-1 block text-xs text-ink-soft">Your browser has not listed any voices yet; the default voice will be used.</span>}
        </label>

        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={settings.captions} onChange={(e) => voice.update({ captions: e.target.checked })} className="h-4 w-4 accent-black" />
            Show captions on the video (also when the voice is off)
          </label>
          {canVibrate && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={settings.vibrate} onChange={(e) => voice.update({ vibrate: e.target.checked })} className="h-4 w-4 accent-black" />
              Vibrate on corrections
            </label>
          )}
          <button type="button" onClick={() => voice.coach.test()} className="rounded-pill bg-ink px-4 py-2 font-semibold text-white">
            Test voice
          </button>
        </div>
        <p className="mt-3 text-xs text-ink-soft">
          Silent mode: leave the voice OFF and keep captions on. You still get the same feedback as text, and optionally a short vibration.
        </p>
      </Tile>

      <Tile tone="sand">
        <h2 className="text-xs font-extrabold uppercase tracking-wide">Privacy and data</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Pose tracking runs on this device. Video is never uploaded or stored; only numbers (angles, scores) are saved here, in your browser.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Link to="/history" className="rounded-pill bg-white px-4 py-2 text-sm font-semibold">
            View saved sessions
          </Link>
          <button
            type="button"
            onClick={() => {
              if (confirm('Delete ALL saved sessions, reps and your saved body profile from this device?')) void getRuntime().repository.clearAll();
            }}
            className="text-sm font-medium text-red-700 underline"
          >
            Delete all my data
          </button>
        </div>
      </Tile>
    </main>
  );
}
