"""Side-view squat geometry. Mirrors frontend/src/engine/geometry.ts exactly."""
from __future__ import annotations

import math

import numpy as np

from .config import CFG


def torso_needed(t_r, s_r, alpha, phi, foot: float = CFG["foot_offset"]):
    """Balance-derived torso lean (deg). t_r = thigh/torso, s_r = shank/torso. Vectorised."""
    a, p = np.radians(alpha), np.radians(phi)
    return np.degrees(np.arcsin(np.clip(t_r * np.cos(p) - s_r * np.sin(a) + foot, -1, 1)))


def _angle_rows(u, v):
    cosv = (u * v).sum(-1) / (np.linalg.norm(u, axis=-1) * np.linalg.norm(v, axis=-1) + 1e-9)
    return np.degrees(np.arccos(np.clip(cosv, -1, 1)))


def pose_angles(t_r, s_r, alpha, phi, tau):
    """Knee and hip angles implied by the planar geometry (vectorised)."""
    a, p, ta = np.radians(alpha), np.radians(phi), np.radians(tau)
    knee = np.asarray(s_r)[..., None] * np.stack([np.sin(a), np.cos(a)], -1)
    hip = knee + np.asarray(t_r)[..., None] * np.stack([-np.cos(p), np.sin(p)], -1)
    sh = hip + np.stack([np.sin(ta), np.cos(ta)], -1)
    return _angle_rows(hip - knee, -knee), _angle_rows(sh - hip, knee - hip)


def planar_points(t_r: float, s_r: float, alpha: float, phi: float, tau: float) -> dict:
    """Joint positions in torso lengths: x forward, y up, ankle at the origin."""
    a, p, ta = math.radians(alpha), math.radians(phi), math.radians(tau)
    knee = (s_r * math.sin(a), s_r * math.cos(a))
    hip = (knee[0] - t_r * math.cos(p), knee[1] + t_r * math.sin(p))
    shoulder = (hip[0] + math.sin(ta), hip[1] + math.cos(ta))
    return dict(ankle=(0.0, 0.0), knee=knee, hip=hip, shoulder=shoulder)


def knee_at_pose(t_r: float, s_r: float, alpha: float, phi: float) -> float:
    pts = planar_points(t_r, s_r, alpha, phi, 0.0)
    u = np.subtract(pts["hip"], pts["knee"])
    v = -np.asarray(pts["knee"])
    return float(_angle_rows(u, v))


# ------------------------- 3-D landmark features (what MediaPipe world landmarks provide) -------------------------
def _ang3(a, b, c) -> float:
    u, v = a - b, c - b
    cosv = float(np.dot(u, v)) / (float(np.linalg.norm(u)) * float(np.linalg.norm(v)) + 1e-9)
    return math.degrees(math.acos(max(-1.0, min(1.0, cosv))))


def _from_vertical(u) -> float:
    return math.degrees(math.acos(max(0.0, min(1.0, abs(float(u[1])) / (float(np.linalg.norm(u)) + 1e-9)))))


def features_from_world(sh, hip, kn, an, up_sign: int) -> dict:
    """knee/hip/torso/shank/phi in degrees plus segment lengths, from four 3-D points."""
    sh, hip, kn, an = (np.asarray(p, float) for p in (sh, hip, kn, an))
    thigh = hip - kn
    return dict(
        knee=_ang3(hip, kn, an),
        hip=_ang3(sh, hip, kn),
        torso=_from_vertical(sh - hip),
        shank=_from_vertical(kn - an),
        phi=math.degrees(math.asin(max(-1.0, min(1.0, up_sign * float(thigh[1]) / (float(np.linalg.norm(thigh)) + 1e-9))))),
        thigh_len=float(np.linalg.norm(thigh)),
        shank_len=float(np.linalg.norm(kn - an)),
        torso_len=float(np.linalg.norm(sh - hip)),
    )


def profile_from_lengths(thigh: float, shank: float, torso: float, up_sign: int) -> dict:
    return dict(
        femur_torso=thigh / torso,
        shank_femur=shank / thigh,
        leg_torso=(thigh + shank) / torso,
        up_sign=up_sign,
    )
