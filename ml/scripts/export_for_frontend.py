#!/usr/bin/env python3
"""Train the models and write model/config/fixtures into the frontend.

    cd ml && python scripts/export_for_frontend.py
    python scripts/export_for_frontend.py --csv labelled_reps.csv     # train on real, coach-labelled reps
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import pandas as pd  # noqa: E402

from formfit_ml.config import ALL_FEATS  # noqa: E402
from formfit_ml.export import write_artifacts  # noqa: E402

DEFAULT_OUT = ROOT.parent / "frontend" / "src" / "engine" / "generated"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--people", type=int, default=1000, help="synthetic people")
    ap.add_argument("--reps", type=int, default=20, help="synthetic reps per person")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--csv", type=Path, nargs="*", help="real labelled CSV export(s) from the web app")
    args = ap.parse_args()

    df, source = None, "synthetic"
    if args.csv:
        df = pd.concat([pd.read_csv(p) for p in args.csv], ignore_index=True).dropna(subset=ALL_FEATS + ["label"])
        df["label"] = df["label"].astype(int)
        source = "real"
        print(f"Loaded {len(df)} real reps from {df.person_id.nunique()} people")

    info = write_artifacts(args.out, args.people, args.reps, args.seed, df=df, data_source=source)
    print(f"Wrote {', '.join(info['files'])} to {args.out}")
    print("Model version:", info["version"])
    print("Held-out metrics:", {k: round(v, 3) if isinstance(v, float) else v for k, v in info["metrics"].items()})


if __name__ == "__main__":
    main()
