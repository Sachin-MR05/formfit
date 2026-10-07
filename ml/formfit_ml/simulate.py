"""Physics-based synthetic population + squat-rep simulator.

A stand-in so the pipeline runs end to end today. Replace with coach-labelled reps recorded in the
web app (CSV export) once you have them; `train.py` accepts a real DataFrame with the same columns.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .config import CFG
from .geometry import pose_angles, torso_needed


def simulate_dataset(n_people: int = 1000, reps_per_person: int = 20, seed: int = 0, noise_deg: float = 5.0) -> pd.DataFrame:
    r = np.random.default_rng(seed)
    out = []
    for pid in range(n_people):
        ft = float(np.clip(r.normal(0.85, 0.08), 0.62, 1.10))   # true thigh / torso
        sf = float(np.clip(r.normal(1.00, 0.07), 0.80, 1.20))   # true shank / thigh
        t_r, s_r = ft, ft * sf
        alpha_nat = r.uniform(*CFG["alpha_range"])              # personal ankle mobility
        bt, bs = r.normal(0, 0.03, 2)                           # calibration error (per person/session)
        t_m, s_m = t_r * (1 + bt), s_r * (1 + bs)               # what calibration "sees"

        n = reps_per_person
        alpha = np.clip(alpha_nat + r.normal(0, 3, n), 10, 62)
        phi = np.where(r.random(n) < 0.75, r.uniform(-22, 3, n), r.uniform(7, 35, n))
        need = torso_needed(t_r, s_r, alpha, phi)
        sign = r.choice([-1, 1], n)
        tau = np.where(r.random(n) < 0.65, need + r.normal(0, 4, n), need + sign * r.uniform(11, 26, n))
        tau = np.clip(tau, 0, 85)

        # ground-truth "coach" label from the person's own geometry (+ tolerance jitter + 3% disagreement)
        tol = r.uniform(CFG["torso_tol"] - 2, CFG["torso_tol"] + 2, n)
        good = (phi <= CFG["depth_phi_ok"]) & (np.abs(tau - need) <= tol) & (alpha <= CFG["alpha_max"])
        good = np.where(r.random(n) < 0.03, ~good, good)

        knee, hip = pose_angles(np.full(n, t_r), np.full(n, s_r), alpha, phi, tau)
        noise = lambda: r.normal(0, noise_deg, n)               # pose-estimation error on every angle
        out.append(pd.DataFrame(dict(
            person_id=pid, rep_id=np.arange(n),
            knee=knee + noise(), hip=hip + noise(), torso=tau + noise(), shank=alpha + noise(), phi=phi + noise(),
            femur_torso=t_m, shank_femur=s_m / t_m, leg_torso=t_m + s_m,
            label=good.astype(int), tau_needed=need)))
    return pd.concat(out, ignore_index=True)
