"""Writes everything the website needs into frontend/src/engine/generated/:

  model.v1.json   trained networks (personalized + generic) with metadata
  config.json     every threshold (single source of truth)
  fixtures.json   parity cases computed by THIS package; the TypeScript tests must reproduce them
"""
from __future__ import annotations

import hashlib
import json
import math
import platform
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import sklearn

from .coach import coach, score_rep, shank_torso, torso_target
from .config import ALL_FEATS, CFG, KIN_FEATS, RATIO_FEATS, SCHEMA_VERSION
from .geometry import features_from_world, knee_at_pose, planar_points, pose_angles, profile_from_lengths, torso_needed
from .simulate import simulate_dataset
from .tracker import CHANNELS, FeatureSmoother, RepTracker
from .train import proba, train_models


# ----------------------------------------------------------------------------------- model export
def export_mlp(sc, clf, feats: list[str]) -> dict:
    return dict(features=feats, mean=sc.mean_.tolist(), scale=sc.scale_.tolist(),
                W=[w.tolist() for w in clf.coefs_], b=[b.tolist() for b in clf.intercepts_])


def np_forward(M: dict, x) -> float:
    """Exactly what the browser runs: ReLU hidden layers, sigmoid output."""
    a = (np.asarray(x, float) - np.asarray(M["mean"])) / np.asarray(M["scale"])
    for i, (W, b) in enumerate(zip(M["W"], M["b"])):
        a = a @ np.asarray(W) + np.asarray(b)
        if i < len(M["W"]) - 1:
            a = np.maximum(a, 0)
    return float(1 / (1 + np.exp(-a[0])))


def _version_hash(models: dict) -> str:
    blob = json.dumps(models, sort_keys=True).encode()
    return hashlib.sha256(blob).hexdigest()[:8]


# ----------------------------------------------------------------------------------- fixtures
def _f(x) -> float:
    return float(x)


def _geometry_cases(r: np.random.Generator, n: int = 60) -> list[dict]:
    cases = []
    for i in range(n):
        t_r = r.uniform(0.65, 1.1)
        s_r = t_r * r.uniform(0.85, 1.15)
        alpha, phi, tau = r.uniform(5, 55), r.uniform(-25, 85), r.uniform(0, 60)
        pts = planar_points(t_r, s_r, alpha, phi, tau)
        y_down = bool(i % 2 == 0)                    # MediaPipe world coords are y-down; also test y-up
        yaw = math.radians(r.uniform(-35, 35))       # camera not perfectly side-on: 3-D angles must not care
        scale = 0.5                                  # torso ~0.5 m
        world = {}
        for name in ("shoulder", "hip", "knee", "ankle"):
            x, y = pts[name]
            world[name] = [x * scale * math.cos(yaw), (-y if y_down else y) * scale, x * scale * math.sin(yaw)]
        up_sign = -1 if y_down else 1
        feats = features_from_world(world["shoulder"], world["hip"], world["knee"], world["ankle"], up_sign)
        cases.append(dict(landmarks=world, up_sign=up_sign, expected={k: _f(v) for k, v in feats.items()},
                          params=dict(t_r=t_r, s_r=s_r, alpha=alpha, phi=phi, tau=tau)))
    return cases


def _profile_cases(r: np.random.Generator, n: int = 20) -> list[dict]:
    out = []
    for _ in range(n):
        torso = r.uniform(0.4, 0.6)
        thigh, shank = torso * r.uniform(0.65, 1.1), torso * r.uniform(0.6, 1.2)
        up = int(r.choice([-1, 1]))
        out.append(dict(thigh=thigh, shank=shank, torso=torso, up_sign=up,
                        expected={k: _f(v) for k, v in profile_from_lengths(thigh, shank, torso, up).items()}))
    return out


def _balance_cases(r: np.random.Generator, n: int = 40) -> list[dict]:
    out = []
    for _ in range(n):
        ft = r.uniform(0.65, 1.1)
        sf = r.uniform(0.85, 1.15)
        prof = dict(femur_torso=ft, shank_femur=sf, leg_torso=ft * (1 + sf))
        alpha, phi, tau = r.uniform(10, 55), r.uniform(-25, 40), r.uniform(5, 60)
        pts = planar_points(ft, shank_torso(prof), alpha, phi, tau)
        knee, hip = pose_angles(ft, shank_torso(prof), alpha, phi, tau)
        out.append(dict(
            profile=prof, alpha=alpha, phi=phi, tau=tau,
            torso_target=_f(torso_target(prof, alpha, phi)),
            knee_at_pose=_f(knee_at_pose(ft, shank_torso(prof), alpha, phi)),
            pose_knee=_f(knee), pose_hip=_f(hip),
            points={k: [_f(v[0]), _f(v[1])] for k, v in pts.items()}))
    return out


def _row_features(row) -> tuple[dict, dict]:
    f = {k: _f(row[k]) for k in KIN_FEATS}
    prof = {k: _f(row[k]) for k in RATIO_FEATS}
    return f, prof


def _network_and_score_cases(models: dict, test: pd.DataFrame, r: np.random.Generator) -> tuple[list, list]:
    sample = test.sample(100, random_state=int(r.integers(0, 10_000)))
    network = []
    for _, row in sample.iterrows():
        x = [_f(row[k]) for k in ALL_FEATS]
        network.append(dict(x=x, personalized=np_forward(models["personalized"], x),
                            generic=np_forward(models["generic"], x[: len(KIN_FEATS)])))
    scores = []
    for _, row in sample.head(60).iterrows():
        f, prof = _row_features(row)
        for phase in ("rep", "live"):
            s = score_rep(models, f, prof)
            c = coach(f, prof, phase)
            scores.append(dict(phase=phase, features=f, profile=prof, expected=dict(
                personalized=s["personalized"], generic=s["generic"], rule_ok=bool(s["rule_ok"]), rule_reasons=s["rule_reasons"],
                target=_f(c["target"]), diff=_f(c["diff"]), torso=c["torso"], depth_ok=bool(c["depth_ok"]),
                alpha_high=bool(c["alpha_high"]), codes=c["codes"])))
    return network, scores


def _trajectory(r: np.random.Generator, prof: dict, alpha_max: float, min_phi: float, tau_off: float,
                n_half: int = 40, noise: float = 0.6, reps: int = 1, dt: float = 1 / 30) -> list[list[float]]:
    """Frames [t, knee, hip, torso, shank, phi] of `reps` squats with standing pre/post roll."""
    t_r, s_r = prof["femur_torso"], shank_torso(prof)
    frames: list[list[float]] = []

    def push(alpha, phi, tau):
        knee, hip = pose_angles(t_r, s_r, alpha, phi, tau)
        vals = [_f(knee), _f(hip), _f(tau), _f(alpha), _f(phi)]
        frames.append([len(frames) * dt] + [v + _f(r.normal(0, noise)) for v in vals])

    for _ in range(8):
        push(0.0, 88.0, 3.0)
    for _ in range(reps):
        for k in range(2 * n_half + 1):
            u = k / n_half if k <= n_half else (2 * n_half - k) / n_half
            e = 0.5 - 0.5 * math.cos(math.pi * u)
            alpha, phi = alpha_max * e, 88 + (min_phi - 88) * e
            need = float(torso_needed(t_r, s_r, alpha, phi))
            push(alpha, phi, 3 + (need + tau_off - 3) * e)
        for _ in range(12):
            push(0.0, 88.0, 3.0)
    return frames


def _tracker_cases(models: dict, r: np.random.Generator) -> list[dict]:
    prof = dict(femur_torso=1.0, shank_femur=0.95, leg_torso=1.95)
    specs = [
        ("good rep", dict(alpha_max=38, min_phi=-8, tau_off=0.0)),
        ("forward lean", dict(alpha_max=38, min_phi=-8, tau_off=22.0)),
        ("shallow rep", dict(alpha_max=38, min_phi=22, tau_off=0.0)),
        ("tiny dip ignored", dict(alpha_max=10, min_phi=60, tau_off=0.0)),
        ("two reps", dict(alpha_max=36, min_phi=-5, tau_off=2.0, reps=2)),
        ("deep + upright", dict(alpha_max=42, min_phi=-20, tau_off=-18.0)),
    ]
    cases = []
    for name, kw in specs:
        frames = _trajectory(r, prof, **kw)
        sm, tr = FeatureSmoother(), RepTracker()
        events = []
        for fr in frames:
            smoothed = sm.update(dict(zip(CHANNELS, fr[1:])))
            ev = tr.update(fr[0], smoothed)
            if ev:
                s = score_rep(models, ev["bottom"], prof)
                c = coach(ev["bottom"], prof, "rep")
                events.append(dict(
                    start_t=_f(ev["start_t"]), bottom_t=_f(ev["bottom_t"]), end_t=_f(ev["end_t"]),
                    down_s=_f(ev["down_s"]), up_s=_f(ev["up_s"]), min_knee=_f(ev["min_knee"]),
                    bottom={k: _f(v) for k, v in ev["bottom"].items()},
                    personalized=s["personalized"], generic=s["generic"], rule_ok=bool(s["rule_ok"]), codes=c["codes"]))
        cases.append(dict(name=name, profile=prof, frames=frames, expected_reps=events))
    return cases


def _smoother_case(r: np.random.Generator, n: int = 25) -> dict:
    raw = [{k: _f(r.uniform(0, 180)) for k in CHANNELS} for _ in range(n)]
    sm = FeatureSmoother()
    out = [sm.update(x) for x in raw]
    return dict(raw=raw, expected=out)


def build_fixtures(models: dict, test: pd.DataFrame, seed: int = 123) -> dict:
    r = np.random.default_rng(seed)
    network, scores = _network_and_score_cases(models, test, r)
    return dict(
        schema=SCHEMA_VERSION,
        geometry=_geometry_cases(r), profiles=_profile_cases(r), balance=_balance_cases(r),
        network=network, scores=scores, trackers=_tracker_cases(models, r), smoother=_smoother_case(r),
    )


# ----------------------------------------------------------------------------------- entry point
def write_artifacts(out_dir: Path, n_people: int = 1000, reps_per_person: int = 20, seed: int = 0,
                    df: pd.DataFrame | None = None, data_source: str = "synthetic") -> dict:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    if df is None:
        df = simulate_dataset(n_people, reps_per_person, seed=seed)
    trained = train_models(df, seed=seed)
    models = dict(personalized=export_mlp(*trained["personalized"], ALL_FEATS),
                  generic=export_mlp(*trained["generic"], KIN_FEATS))
    version = f"squat-mlp-v{SCHEMA_VERSION}+{_version_hash(models)}"

    # sanity: exported weights must reproduce scikit-learn before we ship them
    te = trained["test"].sample(300, random_state=0)
    for key, feats in (("personalized", ALL_FEATS), ("generic", KIN_FEATS)):
        sc, clf = trained[key]
        ref = proba(sc, clf, te[feats].values)
        got = np.array([np_forward(models[key], row) for row in te[feats].values])
        assert np.max(np.abs(ref - got)) < 1e-9, f"{key}: exported weights differ from scikit-learn"

    model_json = dict(
        schema=SCHEMA_VERSION, model_version=version,
        meta=dict(data_source=data_source, seed=seed, n_people=int(df.person_id.nunique()), n_reps=int(len(df)),
                  created_utc=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                  sklearn=sklearn.__version__, numpy=np.__version__, python=platform.python_version(),
                  metrics={k: round(v, 4) if isinstance(v, float) else v for k, v in trained["metrics"].items()}),
        **models)
    config_json = dict(schema=SCHEMA_VERSION, model_version=version, **CFG,
                       feature_names=dict(kinematic=KIN_FEATS, ratios=RATIO_FEATS))
    fixtures = build_fixtures(models, trained["test"])
    fixtures["model_version"] = version

    (out_dir / "model.v1.json").write_text(json.dumps(model_json, indent=1))
    (out_dir / "config.json").write_text(json.dumps(config_json, indent=2))
    (out_dir / "fixtures.json").write_text(json.dumps(fixtures, separators=(",", ":")))
    (out_dir / "README.md").write_text(
        "# generated/\n\nWritten by `ml/scripts/export_for_frontend.py`. **Do not edit by hand.**\n\n"
        "- `model.v1.json`: trained networks (personalized + generic)\n"
        "- `config.json`: every threshold\n"
        "- `fixtures.json`: Python-computed parity cases checked by the engine tests\n")
    return dict(version=version, metrics=trained["metrics"], files=sorted(p.name for p in out_dir.iterdir()))
