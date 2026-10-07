"""Reference scoring + corrective-cue logic. Mirrors frontend/src/engine/{scoring,coach}.ts."""
from __future__ import annotations

from .config import ALL_FEATS, CFG, KIN_FEATS
from .geometry import torso_needed


def shank_torso(profile: dict) -> float:
    return profile["femur_torso"] * profile["shank_femur"]


def torso_target(profile: dict, alpha: float, phi: float, cfg: dict = CFG) -> float:
    return float(torso_needed(profile["femur_torso"], shank_torso(profile), alpha, phi, cfg["foot_offset"]))


def coach(f: dict, profile: dict, phase: str = "rep", cfg: dict = CFG) -> dict:
    """Geometry-aware verdict for one frame/rep. Codes (not text) are compared across languages."""
    target = torso_target(profile, f["shank"], f["phi"], cfg)
    diff = f["torso"] - target
    torso = "ok" if abs(diff) <= cfg["torso_tol"] else ("forward" if diff > 0 else "upright")
    depth_ok = f["phi"] <= cfg["depth_phi_ok"]
    alpha_high = f["shank"] > cfg["alpha_max"]
    codes = []
    if torso == "forward":
        codes.append("torso_forward")
    if torso == "upright":
        codes.append("torso_upright")
    if alpha_high:
        codes.append("knee_travel")
    if phase == "rep" and not depth_ok:
        codes.append("depth_short")
    return dict(target=target, diff=diff, torso=torso, depth_ok=depth_ok, alpha_high=alpha_high, codes=codes)


def rule_verdict(f: dict, cfg: dict = CFG) -> tuple[bool, list[str]]:
    """The fixed-threshold 'one size fits all' baseline."""
    reasons = []
    if f["knee"] > cfg["generic_knee_max"]:
        reasons.append("knee_over")
    if f["torso"] > cfg["generic_torso_max"]:
        reasons.append("torso_over")
    if f["phi"] > cfg["depth_phi_ok"]:
        reasons.append("depth_short")
    return (len(reasons) == 0, reasons)


def feature_vector(f: dict, profile: dict) -> list[float]:
    kin = [f[k] for k in KIN_FEATS]
    return kin + [profile["femur_torso"], profile["shank_femur"], profile["leg_torso"]]


def score_rep(models: dict, f: dict, profile: dict, cfg: dict = CFG) -> dict:
    from .export import np_forward  # local import to avoid a cycle

    x = feature_vector(f, profile)
    ok, reasons = rule_verdict(f, cfg)
    assert len(x) == len(ALL_FEATS)
    return dict(
        personalized=float(np_forward(models["personalized"], x)),
        generic=float(np_forward(models["generic"], x[: len(KIN_FEATS)])),
        rule_ok=ok,
        rule_reasons=reasons,
    )
