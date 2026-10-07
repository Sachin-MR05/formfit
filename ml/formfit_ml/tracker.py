"""Reference EMA smoother + rep state machine. Mirrors frontend/src/engine/{smoothing,repTracker}.ts."""
from __future__ import annotations

from .config import CFG

CHANNELS = ("knee", "hip", "torso", "shank", "phi")


class FeatureSmoother:
    def __init__(self, alpha: float = CFG["ema_alpha"]):
        self.alpha = alpha
        self.state: dict | None = None

    def reset(self) -> None:
        self.state = None

    def update(self, raw: dict) -> dict:
        if self.state is None:
            self.state = {k: raw[k] for k in CHANNELS}
        else:
            a = self.alpha
            self.state = {k: a * raw[k] + (1 - a) * self.state[k] for k in CHANNELS}
        return dict(self.state)


class RepTracker:
    def __init__(self, cfg: dict = CFG):
        self.cfg = cfg
        self.reset()

    def reset(self) -> None:
        self.state = "standing"
        self.rep: dict | None = None

    def update(self, t: float, f: dict) -> dict | None:
        """Feed one smoothed frame. Returns a completed rep dict, or None."""
        c = self.cfg
        if self.state == "standing" and f["knee"] < c["rep_start_knee"]:
            self.state = "down"
            self.rep = dict(start_t=t, min_phi=999.0, min_knee=999.0, bottom=None, bottom_t=None)
        if self.state == "down" and self.rep is not None:
            r = self.rep
            r["min_knee"] = min(r["min_knee"], f["knee"])
            if f["phi"] < r["min_phi"]:
                r["min_phi"] = f["phi"]
                r["bottom"] = {k: f[k] for k in CHANNELS}
                r["bottom_t"] = t
            if f["knee"] > c["rep_end_knee"]:
                self.state = "standing"
                self.rep = None
                if r["bottom"] is None or r["min_knee"] > c["min_rep_knee"]:
                    return None   # too shallow to count
                return dict(
                    start_t=r["start_t"], bottom_t=r["bottom_t"], end_t=t,
                    down_s=r["bottom_t"] - r["start_t"], up_s=t - r["bottom_t"],
                    min_knee=r["min_knee"], bottom=r["bottom"],
                )
        return None
