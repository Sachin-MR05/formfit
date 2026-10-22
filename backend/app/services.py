"""Business rules. Services take plain Python values and a Store; they know nothing about HTTP."""
from __future__ import annotations

import csv
import io
import uuid
from typing import Any, Callable

from . import security, validation as v
from .config import Settings
from .errors import AuthError, Conflict, Forbidden, NotFound
from .ratelimit import LoginRateLimiter
from .repo import Store
from .wire import profile_to_wire, rep_to_wire, session_summary, session_to_wire, user_public

Clock = Callable[[], int]


class AuthService:
    def __init__(self, store: Store, settings: Settings, limiter: LoginRateLimiter, now_ms: Clock):
        self.store, self.settings, self.limiter, self.now_ms = store, settings, limiter, now_ms

    def _session(self, user: dict[str, Any]) -> dict[str, Any]:
        return {
            "user": user_public(user),
            "access_token": security.create_token(user["id"], self.settings),
            "token_type": "bearer",
            "expires_in": self.settings.token_ttl_s,
        }

    def signup(self, body: Any) -> dict[str, Any]:
        d = v.validate_signup(body)
        if self.store.user_by_email(d["email"]):
            raise Conflict("An account with this email already exists. Try signing in.", code="email_taken")
        s = self.settings
        pw_hash = security.hash_password(d["password"], n=s.scrypt_n, r=s.scrypt_r, p=s.scrypt_p)
        uid = str(uuid.uuid4())
        self.store.create_user(id=uid, email=d["email"], password_hash=pw_hash, display_name=d["display_name"], now=self.now_ms())
        user = self.store.user_by_id(uid)
        assert user is not None
        return self._session(user)

    def login(self, body: Any, client_ip: str) -> dict[str, Any]:
        d = v.validate_login(body)
        key = f"{client_ip}|{d['email']}"
        self.limiter.check(key)
        user = self.store.user_by_email(d["email"])
        ok = False
        if user is None:
            security.dummy_verify(d["password"], self.settings)  # same cost as a real check
        else:
            ok = security.verify_password(d["password"], user["password_hash"])
        if not ok or user is None:
            self.limiter.record_failure(key)
            raise AuthError("Incorrect email or password.", code="invalid_credentials")
        self.limiter.reset(key)
        s = self.settings
        if security.needs_rehash(user["password_hash"], n=s.scrypt_n, r=s.scrypt_r, p=s.scrypt_p):
            self.store.set_password_hash(user["id"], security.hash_password(d["password"], n=s.scrypt_n, r=s.scrypt_r, p=s.scrypt_p), self.now_ms())
        return self._session(user)

    def me(self, user_id: str) -> dict[str, Any]:
        user = self.store.user_by_id(user_id)
        if user is None:
            raise AuthError("Invalid credentials.", code="invalid_token")
        return {"user": user_public(user)}


def _result() -> dict[str, Any]:
    return {"accepted": [], "stale": [], "rejected": []}


class SyncService:
    """Idempotent bulk push and cursor-based pull. Clients generate ids, so retrying a push is always safe."""

    def __init__(self, store: Store, now_ms: Clock):
        self.store, self.now_ms = store, now_ms

    def push(self, user_id: str, body: Any) -> dict[str, Any]:
        payload = v.validate_push(body)
        now = self.now_ms()
        out = {"server_time": now, "profiles": _result(), "sessions": _result(), "reps": _result()}

        # --- profiles
        pmeta = self.store.profile_meta([p["id"] for p in payload["profiles"]])
        for p in payload["profiles"]:
            m = pmeta.get(p["id"])
            if m and m["user_id"] != user_id:
                out["profiles"]["rejected"].append({"id": p["id"], "reason": "id_conflict"})
            elif m and int(m["client_updated_at"]) > p["updated_at"]:
                out["profiles"]["stale"].append(p["id"])
            else:
                (out["profiles"]["accepted"] if self.store.upsert_profile(user_id, p, now) else out["profiles"]["stale"]).append(p["id"])

        # --- sessions (including tombstones)
        smeta = self.store.session_meta([s["id"] for s in payload["sessions"]])
        for s in payload["sessions"]:
            m = smeta.get(s["id"])
            res = out["sessions"]
            if m and m["user_id"] != user_id:
                res["rejected"].append({"id": s["id"], "reason": "id_conflict"})
            elif s["deleted"]:
                if m is None or m["deleted_at"] is not None:
                    res["accepted"].append(s["id"])  # nothing to delete: the goal state already holds
                elif int(m["client_updated_at"]) > s["updated_at"]:
                    res["stale"].append(s["id"])
                else:
                    (res["accepted"] if self.store.tombstone_session(user_id, s["id"], s["updated_at"], now) else res["stale"]).append(s["id"])
            elif m and m["deleted_at"] is not None:
                res["rejected"].append({"id": s["id"], "reason": "session_deleted"})
            elif m and int(m["client_updated_at"]) > s["updated_at"]:
                res["stale"].append(s["id"])
            else:
                (res["accepted"] if self.store.upsert_session(user_id, s, now) else res["stale"]).append(s["id"])

        # --- reps (sessions pushed above are now visible)
        smeta = self.store.session_meta([r["session_id"] for r in payload["reps"]])
        rmeta = self.store.rep_meta([r["id"] for r in payload["reps"]])
        for r in payload["reps"]:
            res = out["reps"]
            sm = smeta.get(r["session_id"])
            rm = rmeta.get(r["id"])
            if sm is None or sm["user_id"] != user_id:
                res["rejected"].append({"id": r["id"], "reason": "unknown_session"})
            elif sm["deleted_at"] is not None:
                res["rejected"].append({"id": r["id"], "reason": "session_deleted"})
            elif rm and (rm["user_id"] != user_id or rm["session_id"] != r["session_id"]):
                res["rejected"].append({"id": r["id"], "reason": "id_conflict"})
            elif rm and int(rm["client_updated_at"]) > r["updated_at"]:
                res["stale"].append(r["id"])
            else:
                (res["accepted"] if self.store.upsert_rep(user_id, r, now) else res["stale"]).append(r["id"])
        return out

    def pull(self, user_id: str, query: dict[str, str]) -> dict[str, Any]:
        limit = v.parse_limit(query.get("limit"))
        spec = (("profiles", "body_profiles", profile_to_wire), ("sessions", "sessions", session_to_wire), ("reps", "reps", rep_to_wire))
        out: dict[str, Any] = {"server_time": self.now_ms(), "cursors": {}, "has_more": {}}
        for name, table, to_wire in spec:
            raw = query.get(f"{name}_cursor")
            cursor = v.parse_cursor(raw, f"{name}_cursor")
            rows = self.store.list_since(table, user_id, cursor, limit + 1)
            more = len(rows) > limit
            rows = rows[:limit]
            out[name] = [to_wire(r) for r in rows]
            out["has_more"][name] = more
            out["cursors"][name] = f"{int(rows[-1]['updated_at'])}:{rows[-1]['id']}" if rows else f"{cursor[0]}:{cursor[1]}"
        return out


class HistoryService:
    def __init__(self, store: Store, now_ms: Clock):
        self.store, self.now_ms = store, now_ms

    def list_sessions(self, user_id: str, query: dict[str, str]) -> dict[str, Any]:
        limit = v.parse_limit(query.get("limit"), default=50)
        raw_offset = query.get("offset", "0") or "0"
        if not raw_offset.isdigit():
            raise v.fail("offset", "must be a non-negative integer")
        rows = self.store.sessions_with_stats(user_id, limit, int(raw_offset))
        return {"sessions": [session_summary(r) for r in rows]}

    def get_session(self, user_id: str, session_id: str) -> dict[str, Any]:
        s = self.store.session(user_id, session_id)
        if s is None:
            raise NotFound("Session not found.")
        return {"session": session_to_wire(s), "reps": [rep_to_wire(r) for r in self.store.reps_of_session(user_id, session_id)]}

    def latest_profile(self, user_id: str) -> dict[str, Any]:
        p = self.store.latest_profile(user_id)
        return {"profile": None if p is None else profile_to_wire(p)}

    def set_label(self, user_id: str, rep_id: str, label: str | None) -> dict[str, Any]:
        if not self.store.set_rep_label(user_id, rep_id, label, self.now_ms()):
            raise NotFound("Rep not found.")
        return {"id": rep_id, "label": label}


class AccountService:
    def __init__(self, store: Store, settings: Settings, now_ms: Clock):
        self.store, self.settings, self.now_ms = store, settings, now_ms

    def export_json(self, user_id: str) -> dict[str, Any]:
        user = self.store.user_by_id(user_id)
        if user is None:
            raise AuthError("Invalid credentials.", code="invalid_token")
        return {
            "exported_at": self.now_ms(),
            "user": user_public(user),
            "profiles": [profile_to_wire(p) for p in self.store.all_profiles(user_id)],
            "sessions": [session_to_wire(s) for s in self.store.all_live_sessions(user_id)],
            "reps": [rep_to_wire(r) for r in self.store.all_reps(user_id)],
        }

    def export_csv(self, user_id: str, person_id: str) -> str:
        """Labelled reps in the format `ml/scripts/export_for_frontend.py --csv` expects."""
        buf = io.StringIO()
        w = csv.writer(buf, lineterminator="\n")
        w.writerow(["person_id", "rep_id", "knee", "hip", "torso", "shank", "phi", "femur_torso", "shank_femur", "leg_torso", "label"])
        for r in self.store.all_reps(user_id):
            if r["label"] is None:
                continue
            w.writerow([person_id, r["rep_index"]] + [f"{float(r[k]):.4f}" for k in ("knee", "hip", "torso", "shank", "phi", "femur_torso", "shank_femur", "leg_torso")] + [1 if r["label"] == "good" else 0])
        return buf.getvalue()

    def delete_account(self, user_id: str, password: str) -> dict[str, Any]:
        user = self.store.user_by_id(user_id)
        if user is None:
            raise AuthError("Invalid credentials.", code="invalid_token")
        if not security.verify_password(password, user["password_hash"]):
            raise Forbidden("The password is incorrect.", code="wrong_password")
        counts = self.store.count_rows(user_id)
        self.store.delete_user(user_id)
        return {"deleted": True, "removed": counts}
