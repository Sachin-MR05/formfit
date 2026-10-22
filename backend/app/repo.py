"""All SQL lives here. Statements use `?` placeholders and portable syntax (see db.py).

Upserts are atomic last-writer-wins: the ON CONFLICT ... WHERE clause only lets a row be overwritten when it belongs to
the same user and the incoming client version is not older. A tombstoned (deleted) session is never resurrected.
"""
from __future__ import annotations

import json
from typing import Any, Sequence

from .db import Database

_TABLES = ("body_profiles", "sessions", "reps")
_CHUNK = 400


def _in(ids: Sequence[str]) -> str:
    return ",".join("?" for _ in ids)


class Store:
    def __init__(self, db: Database):
        self.db = db

    # ------------------------------------------------------------------ users
    def create_user(self, *, id: str, email: str, password_hash: str, display_name: str | None, now: int) -> None:
        self.db.execute(
            "INSERT INTO users (id, email, password_hash, display_name, created_at, updated_at, terms_accepted_at) VALUES (?,?,?,?,?,?,?)",
            (id, email, password_hash, display_name, now, now, now),
        )

    def user_by_email(self, email: str) -> dict[str, Any] | None:
        rows = self.db.query("SELECT * FROM users WHERE email = ?", (email,))
        return rows[0] if rows else None

    def user_by_id(self, user_id: str) -> dict[str, Any] | None:
        rows = self.db.query("SELECT * FROM users WHERE id = ?", (user_id,))
        return rows[0] if rows else None

    def set_password_hash(self, user_id: str, password_hash: str, now: int) -> None:
        self.db.execute("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?", (password_hash, now, user_id))

    def delete_user(self, user_id: str) -> None:
        """Hard delete of the account and everything it owns (explicit, so it does not depend on cascades)."""
        for table in ("reps", "sessions", "body_profiles"):
            self.db.execute(f"DELETE FROM {table} WHERE user_id = ?", (user_id,))
        self.db.execute("DELETE FROM users WHERE id = ?", (user_id,))

    # ------------------------------------------------------------------ ownership / version lookups
    def _meta(self, table: str, ids: Sequence[str], cols: str) -> dict[str, dict[str, Any]]:
        assert table in _TABLES
        out: dict[str, dict[str, Any]] = {}
        uniq = list(dict.fromkeys(ids))
        for i in range(0, len(uniq), _CHUNK):
            chunk = uniq[i : i + _CHUNK]
            for r in self.db.query(f"SELECT id, {cols} FROM {table} WHERE id IN ({_in(chunk)})", chunk):
                out[r["id"]] = r
        return out

    def profile_meta(self, ids: Sequence[str]) -> dict[str, dict[str, Any]]:
        return self._meta("body_profiles", ids, "user_id, client_updated_at")

    def session_meta(self, ids: Sequence[str]) -> dict[str, dict[str, Any]]:
        return self._meta("sessions", ids, "user_id, client_updated_at, deleted_at")

    def rep_meta(self, ids: Sequence[str]) -> dict[str, dict[str, Any]]:
        return self._meta("reps", ids, "user_id, session_id, client_updated_at")

    # ------------------------------------------------------------------ upserts (return True if a row was written)
    def upsert_profile(self, user_id: str, p: dict[str, Any], now: int) -> bool:
        n = self.db.execute(
            """INSERT INTO body_profiles (id, user_id, kind, femur_torso, shank_femur, leg_torso, up_sign, side, samples, source,
                   hip_image_y0, thigh2d, created_at, client_updated_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
               ON CONFLICT (id) DO UPDATE SET kind = excluded.kind, femur_torso = excluded.femur_torso,
                   shank_femur = excluded.shank_femur, leg_torso = excluded.leg_torso, up_sign = excluded.up_sign,
                   side = excluded.side, samples = excluded.samples, source = excluded.source,
                   hip_image_y0 = excluded.hip_image_y0, thigh2d = excluded.thigh2d,
                   client_updated_at = excluded.client_updated_at, updated_at = excluded.updated_at
               WHERE body_profiles.user_id = excluded.user_id AND body_profiles.client_updated_at <= excluded.client_updated_at""",
            (p["id"], user_id, p["kind"], p["femur_torso"], p["shank_femur"], p["leg_torso"], p["up_sign"], p["side"], p["samples"],
             p["source"], p["hip_image_y0"], p["thigh2d"], p["created_at"], p["updated_at"], now),
        )
        return n == 1

    def upsert_session(self, user_id: str, s: dict[str, Any], now: int) -> bool:
        pr = s["profile"]
        n = self.db.execute(
            """INSERT INTO sessions (id, user_id, started_at, ended_at, source, file_name, pose_model, model_version,
                   profile_femur_torso, profile_shank_femur, profile_leg_torso, profile_up_sign, client_updated_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
               ON CONFLICT (id) DO UPDATE SET started_at = excluded.started_at, ended_at = excluded.ended_at,
                   source = excluded.source, file_name = excluded.file_name, pose_model = excluded.pose_model,
                   model_version = excluded.model_version, profile_femur_torso = excluded.profile_femur_torso,
                   profile_shank_femur = excluded.profile_shank_femur, profile_leg_torso = excluded.profile_leg_torso,
                   profile_up_sign = excluded.profile_up_sign, client_updated_at = excluded.client_updated_at,
                   updated_at = excluded.updated_at
               WHERE sessions.user_id = excluded.user_id AND sessions.deleted_at IS NULL
                   AND sessions.client_updated_at <= excluded.client_updated_at""",
            (s["id"], user_id, s["started_at"], s["ended_at"], s["source"], s["file_name"], s["pose_model"], s["model_version"],
             pr["femur_torso"], pr["shank_femur"], pr["leg_torso"], pr["up_sign"], s["updated_at"], now),
        )
        return n == 1

    def tombstone_session(self, user_id: str, session_id: str, client_updated_at: int, now: int) -> bool:
        """Delete a session's reps and scrub the session itself; the stub stays so other devices learn about the deletion."""
        n = self.db.execute(
            """UPDATE sessions SET deleted_at = ?, file_name = NULL, client_updated_at = ?, updated_at = ?
               WHERE id = ? AND user_id = ? AND deleted_at IS NULL AND client_updated_at <= ?""",
            (now, client_updated_at, now, session_id, user_id, client_updated_at),
        )
        if n == 1:
            self.db.execute("DELETE FROM reps WHERE session_id = ? AND user_id = ?", (session_id, user_id))
        return n == 1

    def upsert_rep(self, user_id: str, r: dict[str, Any], now: int) -> bool:
        f, pr = r["features"], r["profile"]
        n = self.db.execute(
            """INSERT INTO reps (id, session_id, user_id, rep_index, created_at, t_seconds, knee, hip, torso, shank, phi,
                   femur_torso, shank_femur, leg_torso, score, personalized, generic, rule_ok, rule_reasons, codes, down_s, up_s,
                   model_version, label, client_updated_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
               ON CONFLICT (id) DO UPDATE SET rep_index = excluded.rep_index, t_seconds = excluded.t_seconds,
                   knee = excluded.knee, hip = excluded.hip, torso = excluded.torso, shank = excluded.shank, phi = excluded.phi,
                   femur_torso = excluded.femur_torso, shank_femur = excluded.shank_femur, leg_torso = excluded.leg_torso,
                   score = excluded.score, personalized = excluded.personalized, generic = excluded.generic,
                   rule_ok = excluded.rule_ok, rule_reasons = excluded.rule_reasons, codes = excluded.codes,
                   down_s = excluded.down_s, up_s = excluded.up_s, model_version = excluded.model_version,
                   label = excluded.label, client_updated_at = excluded.client_updated_at, updated_at = excluded.updated_at
               WHERE reps.user_id = excluded.user_id AND reps.session_id = excluded.session_id
                   AND reps.client_updated_at <= excluded.client_updated_at""",
            (r["id"], r["session_id"], user_id, r["index"], r["created_at"], r["t_seconds"], f["knee"], f["hip"], f["torso"],
             f["shank"], f["phi"], pr["femur_torso"], pr["shank_femur"], pr["leg_torso"], r["score"], r["personalized"], r["generic"],
             1 if r["rule_ok"] else 0, json.dumps(r["rule_reasons"]), json.dumps(r["codes"]), r["down_s"], r["up_s"],
             r["model_version"], r["label"], r["updated_at"], now),
        )
        return n == 1

    def set_rep_label(self, user_id: str, rep_id: str, label: str | None, now: int) -> bool:
        n = self.db.execute(
            "UPDATE reps SET label = ?, client_updated_at = ?, updated_at = ? WHERE id = ? AND user_id = ?",
            (label, now, now, rep_id, user_id),
        )
        return n == 1

    # ------------------------------------------------------------------ reads
    def list_since(self, table: str, user_id: str, cursor: tuple[int, str], limit: int) -> list[dict[str, Any]]:
        """Keyset pagination over (updated_at, id): stable even when many rows share a timestamp."""
        assert table in _TABLES
        ts, last_id = cursor
        return self.db.query(
            f"""SELECT * FROM {table} WHERE user_id = ? AND (updated_at > ? OR (updated_at = ? AND id > ?))
                ORDER BY updated_at, id LIMIT ?""",
            (user_id, ts, ts, last_id, limit),
        )

    def sessions_with_stats(self, user_id: str, limit: int, offset: int) -> list[dict[str, Any]]:
        return self.db.query(
            """SELECT s.*, COUNT(r.id) AS rep_count, AVG(r.score) AS avg_score,
                      SUM(CASE WHEN r.score >= 50 THEN 1 ELSE 0 END) AS good_count
               FROM sessions s LEFT JOIN reps r ON r.session_id = s.id
               WHERE s.user_id = ? AND s.deleted_at IS NULL
               GROUP BY s.id ORDER BY s.started_at DESC, s.id LIMIT ? OFFSET ?""",
            (user_id, limit, offset),
        )

    def session(self, user_id: str, session_id: str) -> dict[str, Any] | None:
        rows = self.db.query("SELECT * FROM sessions WHERE id = ? AND user_id = ? AND deleted_at IS NULL", (session_id, user_id))
        return rows[0] if rows else None

    def reps_of_session(self, user_id: str, session_id: str) -> list[dict[str, Any]]:
        return self.db.query("SELECT * FROM reps WHERE session_id = ? AND user_id = ? ORDER BY rep_index, id", (session_id, user_id))

    def latest_profile(self, user_id: str) -> dict[str, Any] | None:
        rows = self.db.query("SELECT * FROM body_profiles WHERE user_id = ? ORDER BY created_at DESC, id LIMIT 1", (user_id,))
        return rows[0] if rows else None

    def all_profiles(self, user_id: str) -> list[dict[str, Any]]:
        return self.db.query("SELECT * FROM body_profiles WHERE user_id = ? ORDER BY created_at, id", (user_id,))

    def all_live_sessions(self, user_id: str) -> list[dict[str, Any]]:
        return self.db.query("SELECT * FROM sessions WHERE user_id = ? AND deleted_at IS NULL ORDER BY started_at, id", (user_id,))

    def all_reps(self, user_id: str) -> list[dict[str, Any]]:
        return self.db.query("SELECT * FROM reps WHERE user_id = ? ORDER BY created_at, id", (user_id,))

    def count_rows(self, user_id: str) -> dict[str, int]:
        return {t: int(self.db.query(f"SELECT COUNT(*) AS n FROM {t} WHERE user_id = ?", (user_id,))[0]["n"]) for t in _TABLES}
