import { engine } from '@/engine/loader.ts';
import { useCoach } from '@/features/session/defaultRuntime.ts';

function Row({ k, v, note }: { k: string; v: string; note?: string }) {
  return (
    <tr>
      <td className="py-0.5 pr-3 text-ink-soft">{k}</td>
      <td className="py-0.5 pr-3 font-mono">{v}</td>
      <td className="py-0.5 text-xs text-ink-soft">{note}</td>
    </tr>
  );
}

/** What the model receives, live: landmark coordinates, joint angles and the body ratios. */
export function FeaturePanel() {
  const live = useCoach((s) => s.live);
  const profile = useCoach((s) => s.profile);
  const f = live?.features ?? null;
  const dash = '—';
  const xy = (p: [number, number] | undefined) => (p ? `${p[0].toFixed(3)}, ${p[1].toFixed(3)}` : dash);

  return (
    <div className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
      <table>
        <tbody>
          <Row k="shoulder (x, y)" v={xy(live?.joints?.shoulder)} />
          <Row k="hip (x, y)" v={xy(live?.joints?.hip)} />
          <Row k="knee (x, y)" v={xy(live?.joints?.knee)} />
          <Row k="ankle (x, y)" v={xy(live?.joints?.ankle)} />
          <Row k="knee_angle" v={f ? `${f.knee.toFixed(1)}°` : dash} note="hip-knee-ankle" />
          <Row k="hip_angle" v={f ? `${f.hip.toFixed(1)}°` : dash} note="shoulder-hip-knee" />
          <Row k="torso_lean" v={f ? `${f.torso.toFixed(1)}°` : dash} note={live?.coach ? `your target ≈ ${live.coach.target.toFixed(0)}°` : 'from vertical'} />
          <Row k="shin_lean" v={f ? `${f.shank.toFixed(1)}°` : dash} note="ankle-knee vs vertical" />
        </tbody>
      </table>
      <table>
        <tbody>
          <Row k="thigh_elevation" v={f && profile ? `${f.phi.toFixed(1)}°` : dash} note={profile ? `depth reached at ≤ ${engine.config.depthPhiOk}°` : 'needs personalization'} />
          <Row k="hip_depth_ratio" v={live?.hipDepthRatio != null ? live.hipDepthRatio.toFixed(2) : dash} note="display only; assumes the calibration camera distance" />
          <Row k="femur_torso" v={profile ? profile.profile.femurTorso.toFixed(3) : dash} />
          <Row k="shank_femur" v={profile ? profile.profile.shankFemur.toFixed(3) : dash} />
          <Row k="leg_torso" v={profile ? profile.profile.legTorso.toFixed(3) : dash} />
          <Row k="model" v={engine.modelVersion} note={`${engine.meta.dataSource} data`} />
        </tbody>
      </table>
    </div>
  );
}
