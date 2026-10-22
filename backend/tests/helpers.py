"""Shared test helpers (no pytest dependency, so the suite also runs with `python tests/run_all.py`)."""
from __future__ import annotations

import json
import logging
from contextlib import contextmanager
from typing import Any, Iterator

from app.config import Settings
from app.db import migrate
from app.http import Dispatcher, HttpRequest, make_db_factory

logging.getLogger("formfit").setLevel(logging.CRITICAL)  # tests that force crashes would otherwise print tracebacks

NOW = 1_760_000_000_000  # an arbitrary "present" inside the accepted timestamp range


class Clock:
    def __init__(self, t: int = NOW):
        self.t = t

    def __call__(self) -> int:
        return self.t

    def advance(self, ms: int) -> None:
        self.t += ms


@contextmanager
def raises(exc: type[BaseException], contains: str | None = None) -> Iterator[None]:
    try:
        yield
    except exc as e:
        if contains is not None and contains not in str(e):
            raise AssertionError(f"expected {exc.__name__} containing {contains!r}, got: {e}") from e
        return
    raise AssertionError(f"expected {exc.__name__} to be raised")


def test_settings(**over: Any) -> Settings:
    base: dict[str, Any] = dict(env="test", database_url="sqlite://:memory:", secret_key="k" * 40, scrypt_n=2**10, login_max_failures=3, login_window_s=60)
    base.update(over)
    return Settings(**base)


def make_dispatcher(clock: Clock | None = None, **over: Any) -> Dispatcher:
    settings = test_settings(**over)
    d = Dispatcher(settings, make_db_factory(settings), now_ms=clock or Clock())
    with d.db_factory() as db:
        migrate(db, settings.migrations_dir)
    return d


def call(d: Dispatcher, method: str, path: str, body: Any = None, token: str | None = None, query: dict[str, str] | None = None, raw: bytes | None = None, ip: str = "1.2.3.4") -> tuple[int, Any]:
    headers = {"authorization": f"Bearer {token}"} if token else {}
    data = raw if raw is not None else (b"" if body is None else json.dumps(body).encode())
    resp = d.handle(HttpRequest(method=method, path="/api" + path, query=query or {}, headers=headers, body=data, client_ip=ip))
    parsed: Any = None
    if resp.body:
        parsed = json.loads(resp.body) if resp.content_type == "application/json" else resp.body.decode()
    return resp.status, parsed


def signup(d: Dispatcher, email: str = "a@example.com", password: str = "correct horse") -> str:
    status, body = call(d, "POST", "/auth/signup", {"email": email, "password": password, "accept_terms": True})
    assert status == 201, body
    return body["access_token"]


# ----------------------------------------------------------------------------- valid wire records
def profile(pid: str = "prof-0001", updated: int = NOW, **over: Any) -> dict[str, Any]:
    p = {"id": pid, "kind": "measured", "femur_torso": 0.94, "shank_femur": 0.98, "leg_torso": 1.86, "up_sign": -1, "side": "left",
         "samples": 20, "source": "2 file(s)", "hip_image_y0": 0.5, "thigh2d": 0.2, "created_at": NOW, "updated_at": updated}
    p.update(over)
    return p


def session(sid: str = "sess-0001", updated: int = NOW, **over: Any) -> dict[str, Any]:
    s = {"id": sid, "started_at": NOW, "ended_at": None, "source": "live", "file_name": None, "pose_model": "full",
         "model_version": "squat-mlp-v1+abc12345", "updated_at": updated,
         "profile": {"femur_torso": 0.94, "shank_femur": 0.98, "leg_torso": 1.86, "up_sign": -1}}
    s.update(over)
    return s


def rep(rid: str = "rep-00001", sid: str = "sess-0001", index: int = 1, updated: int = NOW, **over: Any) -> dict[str, Any]:
    r = {"id": rid, "session_id": sid, "index": index, "created_at": NOW + index, "t_seconds": 3.5 * index,
         "features": {"knee": 60.5, "hip": 50.25, "torso": 35.0, "shank": 38.0, "phi": -5.0},
         "profile": {"femur_torso": 0.94, "shank_femur": 0.98, "leg_torso": 1.86}, "score": 80, "personalized": 0.8, "generic": 0.7,
         "rule_ok": True, "rule_reasons": [], "codes": ["torso_forward"], "down_s": 1.2, "up_s": 0.9,
         "model_version": "squat-mlp-v1+abc12345", "label": None, "updated_at": updated}
    r.update(over)
    return r
