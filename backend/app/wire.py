"""Database rows <-> the JSON shapes of the API (snake_case). Numeric types are normalised (PostgreSQL returns Decimal for AVG)."""
from __future__ import annotations

import json
from typing import Any


def _f(v: Any) -> float | None:
    return None if v is None else float(v)


def user_public(u: dict[str, Any]) -> dict[str, Any]:
    return {"id": u["id"], "email": u["email"], "display_name": u["display_name"], "created_at": int(u["created_at"])}


def profile_to_wire(r: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": r["id"], "kind": r["kind"], "femur_torso": float(r["femur_torso"]), "shank_femur": float(r["shank_femur"]),
        "leg_torso": float(r["leg_torso"]), "up_sign": int(r["up_sign"]), "side": r["side"], "samples": int(r["samples"]),
        "source": r["source"], "hip_image_y0": float(r["hip_image_y0"]), "thigh2d": float(r["thigh2d"]),
        "created_at": int(r["created_at"]), "updated_at": int(r["client_updated_at"]), "server_updated_at": int(r["updated_at"]),
    }


def session_to_wire(r: dict[str, Any]) -> dict[str, Any]:
    base = {"id": r["id"], "updated_at": int(r["client_updated_at"]), "server_updated_at": int(r["updated_at"])}
    if r["deleted_at"] is not None:
        return {**base, "deleted": True}
    return {
        **base, "deleted": False, "started_at": int(r["started_at"]),
        "ended_at": None if r["ended_at"] is None else int(r["ended_at"]),
        "source": r["source"], "file_name": r["file_name"], "pose_model": r["pose_model"], "model_version": r["model_version"],
        "profile": {"femur_torso": float(r["profile_femur_torso"]), "shank_femur": float(r["profile_shank_femur"]),
                    "leg_torso": float(r["profile_leg_torso"]), "up_sign": int(r["profile_up_sign"])},
    }


def rep_to_wire(r: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": r["id"], "session_id": r["session_id"], "index": int(r["rep_index"]), "created_at": int(r["created_at"]),
        "t_seconds": float(r["t_seconds"]),
        "features": {k: float(r[k]) for k in ("knee", "hip", "torso", "shank", "phi")},
        "profile": {k: float(r[k]) for k in ("femur_torso", "shank_femur", "leg_torso")},
        "score": int(r["score"]), "personalized": float(r["personalized"]), "generic": float(r["generic"]),
        "rule_ok": bool(r["rule_ok"]), "rule_reasons": json.loads(r["rule_reasons"]), "codes": json.loads(r["codes"]),
        "down_s": float(r["down_s"]), "up_s": float(r["up_s"]), "model_version": r["model_version"], "label": r["label"],
        "updated_at": int(r["client_updated_at"]), "server_updated_at": int(r["updated_at"]),
    }


def session_summary(r: dict[str, Any]) -> dict[str, Any]:
    out = session_to_wire(r)
    out.update({"rep_count": int(r["rep_count"]), "avg_score": _f(r["avg_score"]), "good_count": int(r["good_count"] or 0)})
    return out
