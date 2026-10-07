"""All thresholds in one place. Exported verbatim to frontend/src/engine/generated/config.json."""
from __future__ import annotations

import math

SCHEMA_VERSION = 1

KIN_FEATS = ["knee", "hip", "torso", "shank", "phi"]               # joint kinematics (deg)
RATIO_FEATS = ["femur_torso", "shank_femur", "leg_torso"]          # static anthropometric ratios
ALL_FEATS = KIN_FEATS + RATIO_FEATS

# Average build used to derive the "one-size-fits-all" torso limit.
AVG_BUILD = dict(t_r=0.85, s_r=0.85, alpha=36.0)


def _torso_needed_scalar(t_r: float, s_r: float, alpha: float, phi: float, foot: float) -> float:
    a, p = math.radians(alpha), math.radians(phi)
    x = max(-1.0, min(1.0, t_r * math.cos(p) - s_r * math.sin(a) + foot))
    return math.degrees(math.asin(x))


def build_config() -> dict:
    cfg = dict(
        foot_offset=0.14,        # mid-foot sits this far ahead of the ankle (torso lengths)
        depth_phi_ok=5.0,        # deg: thigh elevation <= this => depth reached
        torso_tol=8.0,           # deg: tolerance around the balance-derived torso lean
        alpha_range=[26.0, 46.0],  # deg: shank lean across ankle mobilities
        alpha_max=52.0,          # deg: shank lean above this = excessive knee travel
        generic_knee_max=90.0,   # fixed rule: knee angle at the bottom <= 90 deg
        rep_start_knee=140.0,    # knee angle below which a rep has started
        rep_end_knee=160.0,      # knee angle above which the rep has ended
        min_rep_knee=125.0,      # must reach this much knee flexion to count as a rep
        ema_alpha=0.5,           # feature smoothing (weight of the newest sample)
        calib_seconds=3,
        calib_max_frames=30,
        calib_clip_max_s=8.0,
        calib_max_px=1280,
        score_good_min=70,
        score_borderline_min=50,
    )
    avg_need = _torso_needed_scalar(AVG_BUILD["t_r"], AVG_BUILD["s_r"], AVG_BUILD["alpha"], 0.0, cfg["foot_offset"])
    cfg["generic_torso_max"] = round(avg_need + cfg["torso_tol"], 1)   # rule tuned for an average build
    return cfg


CFG = build_config()
