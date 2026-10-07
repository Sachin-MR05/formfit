import { describe, expect, it } from 'vitest';
import { featuresFromWorld, kneeAtPose, planarPoints, poseAngles, profileFromLengths, shankTorso, torsoNeeded } from './geometry.ts';
import { close, engine, fixtures, toProfile, vec3 } from './test-utils.ts';

describe('geometry parity with the Python reference', () => {
  it('has fixtures to compare against', () => {
    expect(fixtures.geometry.length).toBeGreaterThan(30);
    expect(fixtures.balance.length).toBeGreaterThan(20);
  });

  it('landmarks -> joint features (any camera yaw, either y-axis direction)', () => {
    fixtures.geometry.forEach((c, i) => {
      const f = featuresFromWorld(vec3(c.landmarks.shoulder), vec3(c.landmarks.hip), vec3(c.landmarks.knee), vec3(c.landmarks.ankle), c.up_sign);
      for (const k of ['knee', 'hip', 'torso', 'shank', 'phi'] as const) close(`geometry[${i}].${k}`, f[k], c.expected[k]);
      close(`geometry[${i}].thighLen`, f.thighLen, c.expected.thigh_len);
      close(`geometry[${i}].shankLen`, f.shankLen, c.expected.shank_len);
      close(`geometry[${i}].torsoLen`, f.torsoLen, c.expected.torso_len);
    });
  });

  it('segment lengths -> body ratios', () => {
    fixtures.profiles.forEach((c, i) => {
      const p = profileFromLengths(c.thigh, c.shank, c.torso, c.up_sign);
      close(`profiles[${i}].femurTorso`, p.femurTorso, c.expected.femur_torso);
      close(`profiles[${i}].shankFemur`, p.shankFemur, c.expected.shank_femur);
      close(`profiles[${i}].legTorso`, p.legTorso, c.expected.leg_torso);
      expect(p.upSign).toBe(c.up_sign);
    });
  });

  it('balance model: torso target, knee angle and planar pose', () => {
    fixtures.balance.forEach((c, i) => {
      const prof = toProfile(c.profile);
      close(`balance[${i}].torsoTarget`, torsoNeeded(prof, c.alpha, c.phi, engine.config.footOffset), c.torso_target);
      close(`balance[${i}].kneeAtPose`, kneeAtPose(prof, c.alpha, c.phi), c.knee_at_pose);
      const a = poseAngles(prof.femurTorso, shankTorso(prof), c.alpha, c.phi, c.tau);
      close(`balance[${i}].poseKnee`, a.knee, c.pose_knee);
      close(`balance[${i}].poseHip`, a.hip, c.pose_hip);
      const pts = planarPoints(prof.femurTorso, shankTorso(prof), c.alpha, c.phi, c.tau);
      for (const joint of ['ankle', 'knee', 'hip', 'shoulder'] as const) {
        close(`balance[${i}].${joint}.x`, pts[joint][0], c.points[joint][0]);
        close(`balance[${i}].${joint}.y`, pts[joint][1], c.points[joint][1]);
      }
    });
  });

  it('long-femur bodies legitimately need more forward lean than short-femur bodies', () => {
    const short = torsoNeeded({ femurTorso: 0.7, shankFemur: 1 }, 28, 0, engine.config.footOffset);
    const long = torsoNeeded({ femurTorso: 1.05, shankFemur: 1 }, 28, 0, engine.config.footOffset);
    expect(long).toBeGreaterThan(short + 8);
    expect(long).toBeGreaterThan(engine.config.genericTorsoMax); // the fixed rule would wrongly reject this person
  });
});
