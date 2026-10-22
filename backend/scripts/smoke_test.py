#!/usr/bin/env python3
"""End-to-end check of a RUNNING server (FastAPI + PostgreSQL included), using only the standard library.

    python scripts/smoke_test.py http://localhost:8000

It creates a throw-away account, pushes a session, reads it back as a "second device", labels a rep, exports the
training CSV, deletes the session and finally deletes the account. Exit code 0 = everything works.
"""
from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request
import uuid


def request(base: str, method: str, path: str, body=None, token: str | None = None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(base + path, data=data, method=method)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            raw = r.read().decode()
            return r.status, (json.loads(raw) if r.headers.get("Content-Type", "").startswith("application/json") else raw)
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except json.JSONDecodeError:
            return e.code, raw


def check(label: str, cond: bool, detail=None) -> None:
    print(f"  {'OK  ' if cond else 'FAIL'} {label}")
    if not cond:
        print(f"       -> {detail}")
        raise AssertionError(label)


def run(base: str) -> None:
    base = base.rstrip("/")
    now = int(time.time() * 1000)
    tag = uuid.uuid4().hex[:10]
    email, password = f"smoke-{tag}@example.com", "smoke-test-password"
    sid, rid1, rid2 = f"sess-{tag}", f"rep1-{tag}", f"rep2-{tag}"

    s, b = request(base, "GET", "/api/health")
    check("health", s == 200 and b == {"status": "ok"}, b)

    s, b = request(base, "POST", "/api/auth/signup", {"email": email, "password": password, "accept_terms": True})
    check("sign up", s == 201 and "access_token" in b, b)
    token = b["access_token"]

    profile = {"id": f"prof-{tag}", "kind": "measured", "femur_torso": 0.94, "shank_femur": 0.98, "leg_torso": 1.86, "up_sign": -1, "side": "left",
               "samples": 20, "source": "smoke test", "hip_image_y0": 0.5, "thigh2d": 0.2, "created_at": now, "updated_at": now}
    session = {"id": sid, "started_at": now, "ended_at": now + 1000, "source": "live", "file_name": None, "pose_model": "full", "model_version": "smoke",
               "updated_at": now, "profile": {"femur_torso": 0.94, "shank_femur": 0.98, "leg_torso": 1.86, "up_sign": -1}}

    def rep(rid, index, score):
        return {"id": rid, "session_id": sid, "index": index, "created_at": now + index, "t_seconds": 3.0 * index,
                "features": {"knee": 60.5, "hip": 50.25, "torso": 35.0, "shank": 38.0, "phi": -5.0},
                "profile": {"femur_torso": 0.94, "shank_femur": 0.98, "leg_torso": 1.86}, "score": score, "personalized": score / 100, "generic": 0.7,
                "rule_ok": True, "rule_reasons": [], "codes": [], "down_s": 1.2, "up_s": 0.9, "model_version": "smoke", "label": None, "updated_at": now}

    payload = {"profiles": [profile], "sessions": [session], "reps": [rep(rid1, 1, 90), rep(rid2, 2, 70)]}
    s, b = request(base, "POST", "/api/sync/push", payload, token)
    check("push session + reps", s == 200 and len(b["reps"]["accepted"]) == 2 and not b["reps"]["rejected"], b)
    s, b = request(base, "POST", "/api/sync/push", payload, token)
    check("push again is idempotent", s == 200 and len(b["reps"]["accepted"]) == 2, b)

    s, b = request(base, "GET", "/api/sessions", token=token)
    check("history lists the session with stats", s == 200 and b["sessions"][0]["rep_count"] == 2 and b["sessions"][0]["avg_score"] == 80, b)

    s, b = request(base, "POST", "/api/auth/login", {"email": email, "password": password})
    check("sign in again (second device)", s == 200, b)
    token2 = b["access_token"]
    s, b = request(base, "GET", "/api/sync/pull", token=token2)
    check("second device pulls the data", s == 200 and len(b["sessions"]) == 1 and len(b["reps"]) == 2 and len(b["profiles"]) == 1, b)

    s, b = request(base, "PUT", f"/api/reps/{rid1}/label", {"label": "good"}, token2)
    check("label a rep", s == 200, b)
    s, csv_text = request(base, "GET", "/api/export.csv?person_id=smoke", token=token)
    check("export labelled reps as CSV", s == 200 and csv_text.strip().split("\n")[1].startswith("smoke,1,60.5000"), csv_text)

    s, b = request(base, "POST", "/api/sync/push", {"sessions": [{"id": sid, "updated_at": now + 5000, "deleted": True}]}, token)
    check("delete the session", s == 200 and b["sessions"]["accepted"] == [sid], b)
    s, b = request(base, "GET", "/api/sessions", token=token)
    check("history is empty again", s == 200 and b["sessions"] == [], b)

    s, b = request(base, "DELETE", "/api/me", {"password": password}, token)
    check("delete the account", s == 200 and b["deleted"] is True, b)
    s, b = request(base, "GET", "/api/auth/me", token=token)
    check("old token no longer works", s == 401, b)
    print("\nAll smoke checks passed.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: python scripts/smoke_test.py http://localhost:8000")
    try:
        run(sys.argv[1])
    except (AssertionError, urllib.error.URLError) as e:
        sys.exit(f"\nSmoke test failed: {e}")
