"""Run with: pytest ml/tests   (or `python ml/tests/test_engine_reference.py` without pytest)."""
import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from formfit_ml.coach import coach, rule_verdict, shank_torso, torso_target  # noqa: E402
from formfit_ml.config import CFG  # noqa: E402
from formfit_ml.geometry import (  # noqa: E402
    features_from_world, knee_at_pose, planar_points, pose_angles, profile_from_lengths, torso_needed)
from formfit_ml.tracker import FeatureSmoother, RepTracker  # noqa: E402


def _world(params, y_down, yaw_deg, scale=0.5):
    pts = planar_points(**params)
    yaw = math.radians(yaw_deg)
    out = {}
    for name in ("shoulder", "hip", "knee", "ankle"):
        x, y = pts[name]
        out[name] = [x * scale * math.cos(yaw), (-y if y_down else y) * scale, x * scale * math.sin(yaw)]
    return out


def test_landmark_features_recover_the_simulator_angles_for_any_yaw_and_axis_direction():
    p = dict(t_r=0.95, s_r=0.9, alpha=33.0, phi=-4.0, tau=36.0)
    knee, hip = pose_angles(p["t_r"], p["s_r"], p["alpha"], p["phi"], p["tau"])
    for y_down in (True, False):
        for yaw in (-30, 0, 25):
            w = _world(p, y_down, yaw)
            f = features_from_world(w["shoulder"], w["hip"], w["knee"], w["ankle"], -1 if y_down else 1)
            assert abs(f["torso"] - p["tau"]) < 1e-6
            assert abs(f["shank"] - p["alpha"]) < 1e-6
            assert abs(f["phi"] - p["phi"]) < 1e-6
            assert abs(f["knee"] - knee) < 1e-5 and abs(f["hip"] - hip) < 1e-5   # eps in the denominators differs by unit scale


def test_balance_target_grows_with_femur_length():
    short = float(torso_needed(0.7, 0.7, 28.0, 0.0))
    long_ = float(torso_needed(1.05, 1.05, 28.0, 0.0))   # stiffer ankles (28 deg shin lean) push the need up further
    assert long_ > short + 8, "long-femur people legitimately need more forward lean"
    assert long_ > CFG["generic_torso_max"], "a fixed rule would wrongly reject them"


def test_knee_at_parallel_is_plausible():
    assert 50 < knee_at_pose(0.94, 0.92, 36.0, 0.0) < 80


def test_profile_ratios_are_consistent():
    p = profile_from_lengths(0.47, 0.46, 0.50, -1)
    assert abs(p["leg_torso"] - (p["femur_torso"] * (1 + p["shank_femur"]))) < 1e-12


def test_coach_codes():
    prof = dict(femur_torso=1.0, shank_femur=0.95, leg_torso=1.95)
    t = torso_target(prof, 38.0, -5.0)
    ok = dict(knee=60.0, hip=50.0, torso=t, shank=38.0, phi=-5.0)
    assert coach(ok, prof)["codes"] == []
    assert coach({**ok, "torso": t + 20}, prof)["codes"] == ["torso_forward"]
    assert coach({**ok, "torso": t - 20}, prof)["codes"] == ["torso_upright"]
    assert coach({**ok, "phi": 20.0}, prof, "rep")["codes"][-1] == "depth_short"
    assert "depth_short" not in coach({**ok, "phi": 20.0}, prof, "live")["codes"]


def test_fixed_rule_rejects_balanced_long_femur_squat():
    prof = dict(femur_torso=1.05, shank_femur=1.0, leg_torso=2.1)
    t = torso_target(prof, 28.0, -5.0)
    f = dict(knee=55.0, hip=45.0, torso=t, shank=28.0, phi=-5.0)
    assert coach(f, prof)["codes"] == []                      # balanced for THIS body
    ok, reasons = rule_verdict(f)
    assert not ok and "torso_over" in reasons                 # the fixed rule says "wrong"


def test_smoother_first_sample_passthrough_and_ema():
    sm = FeatureSmoother(0.5)
    a = sm.update(dict(knee=100, hip=100, torso=100, shank=100, phi=100))
    b = sm.update(dict(knee=0, hip=0, torso=0, shank=0, phi=0))
    assert a["knee"] == 100 and b["knee"] == 50


def test_tracker_counts_a_rep_and_ignores_a_dip():
    def run(depth_knee):
        tr, reps = RepTracker(), []
        for i, k in enumerate([170, 150, 135, depth_knee, 135, 150, 165, 170]):
            ev = tr.update(i / 30, dict(knee=k, hip=90, torso=30, shank=30, phi=k - 120))
            if ev:
                reps.append(ev)
        return reps

    assert len(run(70)) == 1
    assert len(run(135)) == 0


if __name__ == "__main__":
    fails = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn(); print("PASS", name)
            except Exception as e:  # noqa: BLE001
                fails += 1; print("FAIL", name, "->", repr(e))
    sys.exit(1 if fails else 0)
