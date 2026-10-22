"""Strict validation of everything the API accepts. Output is normalised plain dicts in snake_case.

Rules: unknown fields are ignored, wrong types are rejected (bool is not a number), numbers must be finite and in
range, strings are length-limited, ids are restricted to a safe alphabet. Errors name the exact field path.
"""
from __future__ import annotations

import math
import re
from typing import Any, Iterable

from .errors import ValidationError

ID_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
CURSOR_RE = re.compile(r"^(\d{1,16}):([A-Za-z0-9_-]{0,64})$")
PERSON_RE = re.compile(r"^[A-Za-z0-9_-]{1,40}$")

TS_MIN = 1_577_836_800_000  # 2020-01-01
TS_MAX = 4_102_444_800_000  # 2100-01-01

PROFILE_KINDS = ("measured", "manual", "average")
SIDES = ("left", "right")
SESSION_SOURCES = ("live", "upload")
POSE_MODELS = ("lite", "full", "heavy")
LABELS = ("good", "faulty")
CUE_CODES = ("torso_forward", "torso_upright", "knee_travel", "depth_short")
RULE_REASONS = ("knee_over", "torso_over", "depth_short")

MAX_PROFILES_PER_PUSH = 20
MAX_SESSIONS_PER_PUSH = 100
MAX_REPS_PER_PUSH = 500
MAX_PULL_LIMIT = 1000


def fail(path: str, problem: str) -> ValidationError:
    return ValidationError(f"{path}: {problem}", details={"field": path, "problem": problem})


def _obj(v: Any, path: str) -> dict[str, Any]:
    if not isinstance(v, dict):
        raise fail(path, "must be an object")
    return v


def _present(d: dict[str, Any], key: str, path: str) -> Any:
    if key not in d:
        raise fail(f"{path}.{key}" if path else key, "is required")
    return d[key]


def _p(path: str, key: str) -> str:
    return f"{path}.{key}" if path else key


def req_str(d: dict[str, Any], key: str, path: str = "", *, min_len: int = 1, max_len: int = 200) -> str:
    v = _present(d, key, path)
    if not isinstance(v, str):
        raise fail(_p(path, key), "must be a string")
    if not (min_len <= len(v) <= max_len):
        raise fail(_p(path, key), f"length must be between {min_len} and {max_len}")
    return v


def opt_str(d: dict[str, Any], key: str, path: str = "", *, max_len: int = 200) -> str | None:
    if d.get(key) is None:
        return None
    return req_str(d, key, path, min_len=0, max_len=max_len)


def req_num(d: dict[str, Any], key: str, path: str, lo: float, hi: float) -> float:
    v = _present(d, key, path)
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v):
        raise fail(_p(path, key), "must be a finite number")
    if not (lo <= v <= hi):
        raise fail(_p(path, key), f"must be between {lo} and {hi}")
    return float(v)


def req_int(d: dict[str, Any], key: str, path: str, lo: int, hi: int) -> int:
    v = _present(d, key, path)
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or int(v) != v:
        raise fail(_p(path, key), "must be an integer")
    if not (lo <= v <= hi):
        raise fail(_p(path, key), f"must be between {lo} and {hi}")
    return int(v)


def req_bool(d: dict[str, Any], key: str, path: str = "") -> bool:
    v = _present(d, key, path)
    if not isinstance(v, bool):
        raise fail(_p(path, key), "must be true or false")
    return v


def req_enum(d: dict[str, Any], key: str, path: str, allowed: Iterable[Any]) -> Any:
    v = _present(d, key, path)
    allowed = tuple(allowed)
    if v not in allowed or isinstance(v, bool):
        raise fail(_p(path, key), f"must be one of {list(allowed)}")
    return v


def req_id(d: dict[str, Any], key: str, path: str = "") -> str:
    v = _present(d, key, path)
    if not isinstance(v, str) or not ID_RE.match(v):
        raise fail(_p(path, key), "must be 8 to 64 characters of letters, digits, '-' or '_'")
    return v


def req_ts(d: dict[str, Any], key: str, path: str = "") -> int:
    return req_int(d, key, path, TS_MIN, TS_MAX)


def _str_list(d: dict[str, Any], key: str, path: str, allowed: tuple[str, ...], max_items: int = 8) -> list[str]:
    v = _present(d, key, path)
    if not isinstance(v, list) or len(v) > max_items:
        raise fail(_p(path, key), f"must be a list of at most {max_items} items")
    for item in v:
        if item not in allowed:
            raise fail(_p(path, key), f"items must be among {list(allowed)}")
    return list(dict.fromkeys(v))  # unique, order kept


# ----------------------------------------------------------------------------- auth
def validate_email(raw: Any, path: str = "email") -> str:
    if not isinstance(raw, str):
        raise fail(path, "must be a string")
    email = raw.strip().lower()
    if len(email) > 254 or not EMAIL_RE.match(email):
        raise fail(path, "must be a valid email address")
    return email


def validate_signup(body: Any) -> dict[str, Any]:
    d = _obj(body, "body")
    email = validate_email(d.get("email"))
    password = d.get("password")
    if not isinstance(password, str) or not (8 <= len(password) <= 128):
        raise fail("password", "must be 8 to 128 characters")
    if d.get("accept_terms") is not True:
        raise fail("accept_terms", "you must accept the terms and privacy notice")
    name = d.get("display_name")
    if name is not None:
        if not isinstance(name, str) or len(name.strip()) > 60:
            raise fail("display_name", "must be at most 60 characters")
        name = name.strip() or None
    return {"email": email, "password": password, "display_name": name}


def validate_login(body: Any) -> dict[str, str]:
    d = _obj(body, "body")
    email = validate_email(d.get("email"))
    password = d.get("password")
    if not isinstance(password, str) or not (1 <= len(password) <= 128):
        raise fail("password", "must be a non-empty string of at most 128 characters")
    return {"email": email, "password": password}


def validate_password_confirmation(body: Any) -> str:
    d = _obj(body, "body")
    pw = d.get("password")
    if not isinstance(pw, str) or not (1 <= len(pw) <= 128):
        raise fail("password", "is required to confirm this action")
    return pw


# ----------------------------------------------------------------------------- sync records
def validate_profile(v: Any, path: str = "profile") -> dict[str, Any]:
    d = _obj(v, path)
    return {
        "id": req_id(d, "id", path),
        "kind": req_enum(d, "kind", path, PROFILE_KINDS),
        "femur_torso": req_num(d, "femur_torso", path, 0.1, 5),
        "shank_femur": req_num(d, "shank_femur", path, 0.1, 5),
        "leg_torso": req_num(d, "leg_torso", path, 0.1, 10),
        "up_sign": req_enum(d, "up_sign", path, (-1, 1)),
        "side": req_enum(d, "side", path, SIDES),
        "samples": req_int(d, "samples", path, 0, 10_000),
        "source": req_str(d, "source", path, min_len=0, max_len=200),
        "hip_image_y0": req_num(d, "hip_image_y0", path, -5, 5),
        "thigh2d": req_num(d, "thigh2d", path, 0, 5),
        "created_at": req_ts(d, "created_at", path),
        "updated_at": req_ts(d, "updated_at", path),
    }


def _ratios(v: Any, path: str) -> dict[str, float]:
    d = _obj(v, path)
    return {
        "femur_torso": req_num(d, "femur_torso", path, 0.1, 5),
        "shank_femur": req_num(d, "shank_femur", path, 0.1, 5),
        "leg_torso": req_num(d, "leg_torso", path, 0.1, 10),
    }


def validate_session(v: Any, path: str = "session") -> dict[str, Any]:
    d = _obj(v, path)
    sid = req_id(d, "id", path)
    updated = req_ts(d, "updated_at", path)
    if d.get("deleted") is True:  # a tombstone needs only the id and the time of deletion
        return {"id": sid, "updated_at": updated, "deleted": True}
    prof = _obj(_present(d, "profile", path), _p(path, "profile"))
    ratios = _ratios(prof, _p(path, "profile"))
    ended = d.get("ended_at")
    return {
        "id": sid,
        "deleted": False,
        "started_at": req_ts(d, "started_at", path),
        "ended_at": None if ended is None else req_ts(d, "ended_at", path),
        "source": req_enum(d, "source", path, SESSION_SOURCES),
        "file_name": opt_str(d, "file_name", path, max_len=255),
        "pose_model": req_enum(d, "pose_model", path, POSE_MODELS),
        "model_version": req_str(d, "model_version", path, max_len=100),
        "profile": {**ratios, "up_sign": req_enum(prof, "up_sign", _p(path, "profile"), (-1, 1))},
        "updated_at": updated,
    }


def validate_rep(v: Any, path: str = "rep") -> dict[str, Any]:
    d = _obj(v, path)
    feats = _obj(_present(d, "features", path), _p(path, "features"))
    fp = _p(path, "features")
    label = d.get("label")
    if label is not None and label not in LABELS:
        raise fail(_p(path, "label"), f"must be null or one of {list(LABELS)}")
    return {
        "id": req_id(d, "id", path),
        "session_id": req_id(d, "session_id", path),
        "index": req_int(d, "index", path, 1, 10_000),
        "created_at": req_ts(d, "created_at", path),
        "t_seconds": req_num(d, "t_seconds", path, 0, 86_400),
        "features": {k: req_num(feats, k, fp, -360, 360) for k in ("knee", "hip", "torso", "shank", "phi")},
        "profile": _ratios(_present(d, "profile", path), _p(path, "profile")),
        "score": req_int(d, "score", path, 0, 100),
        "personalized": req_num(d, "personalized", path, 0, 1),
        "generic": req_num(d, "generic", path, 0, 1),
        "rule_ok": req_bool(d, "rule_ok", path),
        "rule_reasons": _str_list(d, "rule_reasons", path, RULE_REASONS),
        "codes": _str_list(d, "codes", path, CUE_CODES),
        "down_s": req_num(d, "down_s", path, 0, 120),
        "up_s": req_num(d, "up_s", path, 0, 120),
        "model_version": req_str(d, "model_version", path, max_len=100),
        "label": label,
        "updated_at": req_ts(d, "updated_at", path),
    }


def _list(d: dict[str, Any], key: str, max_items: int) -> list[Any]:
    v = d.get(key, [])
    if not isinstance(v, list):
        raise fail(key, "must be a list")
    if len(v) > max_items:
        raise fail(key, f"at most {max_items} items per request")
    return v


def validate_push(body: Any) -> dict[str, list[dict[str, Any]]]:
    d = _obj(body, "body")
    return {
        "profiles": [validate_profile(x, f"profiles[{i}]") for i, x in enumerate(_list(d, "profiles", MAX_PROFILES_PER_PUSH))],
        "sessions": [validate_session(x, f"sessions[{i}]") for i, x in enumerate(_list(d, "sessions", MAX_SESSIONS_PER_PUSH))],
        "reps": [validate_rep(x, f"reps[{i}]") for i, x in enumerate(_list(d, "reps", MAX_REPS_PER_PUSH))],
    }


def parse_cursor(raw: str | None, name: str) -> tuple[int, str]:
    if raw is None or raw == "":
        return (0, "")
    m = CURSOR_RE.match(raw)
    if not m:
        raise fail(name, "must look like '<milliseconds>:<id>'")
    return (int(m.group(1)), m.group(2))


def parse_limit(raw: str | None, default: int = 500) -> int:
    if raw is None or raw == "":
        return default
    if not raw.isdigit() or not (1 <= int(raw) <= MAX_PULL_LIMIT):
        raise fail("limit", f"must be an integer between 1 and {MAX_PULL_LIMIT}")
    return int(raw)


def validate_label_body(body: Any) -> str | None:
    d = _obj(body, "body")
    if "label" not in d:
        raise fail("label", "is required")
    if d["label"] is not None and d["label"] not in LABELS:
        raise fail("label", f"must be null or one of {list(LABELS)}")
    return d["label"]


def validate_person_id(raw: str | None) -> str:
    if raw is None or raw == "":
        return "p01"
    if not PERSON_RE.match(raw):
        raise fail("person_id", "must be 1 to 40 characters of letters, digits, '-' or '_'")
    return raw
