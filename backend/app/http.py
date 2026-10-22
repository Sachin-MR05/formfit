"""A framework-free HTTP layer: route table, request/response types and the Dispatcher with all HTTP semantics
(auth header, JSON parsing, size limit, transactions, error mapping). FastAPI (api.py) and the test server just call it.
"""
from __future__ import annotations

import json
import logging
import re
import time
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any, Callable, ContextManager, Iterator

from . import security, validation as v
from .config import Settings
from .db import Database, connect
from .errors import AppError, AuthError, NotFound, PayloadTooLarge, ValidationError
from .ratelimit import LoginRateLimiter
from .repo import Store
from .services import AccountService, AuthService, HistoryService, SyncService

log = logging.getLogger("formfit")
API_PREFIX = "/api"


@dataclass
class HttpRequest:
    method: str
    path: str
    query: dict[str, str] = field(default_factory=dict)
    headers: dict[str, str] = field(default_factory=dict)  # lower-case names
    body: bytes = b""
    client_ip: str = ""
    path_params: dict[str, str] = field(default_factory=dict)


@dataclass
class HttpResponse:
    status: int
    body: bytes
    content_type: str = "application/json"
    headers: dict[str, str] = field(default_factory=dict)


def json_response(status: int, obj: Any, headers: dict[str, str] | None = None) -> HttpResponse:
    return HttpResponse(status, json.dumps(obj, separators=(",", ":")).encode("utf-8"), headers=headers or {})


@dataclass
class Ctx:
    req: HttpRequest
    settings: Settings
    user_id: str | None
    auth: AuthService
    sync: SyncService
    history: HistoryService
    account: AccountService

    def json(self) -> Any:
        if not self.req.body:
            raise ValidationError("body: a JSON body is required", details={"field": "body", "problem": "is required"})
        try:
            return json.loads(self.req.body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as e:
            raise ValidationError("body: must be valid JSON", details={"field": "body", "problem": "invalid JSON"}) from e

    @property
    def uid(self) -> str:
        assert self.user_id is not None
        return self.user_id


# ----------------------------------------------------------------------------- handlers
def h_health(c: Ctx) -> HttpResponse:
    return json_response(200, {"status": "ok"})


def h_signup(c: Ctx) -> HttpResponse:
    return json_response(201, c.auth.signup(c.json()))


def h_login(c: Ctx) -> HttpResponse:
    return json_response(200, c.auth.login(c.json(), c.req.client_ip))


def h_me(c: Ctx) -> HttpResponse:
    return json_response(200, c.auth.me(c.uid))


def h_push(c: Ctx) -> HttpResponse:
    return json_response(200, c.sync.push(c.uid, c.json()))


def h_pull(c: Ctx) -> HttpResponse:
    return json_response(200, c.sync.pull(c.uid, c.req.query))


def h_sessions(c: Ctx) -> HttpResponse:
    return json_response(200, c.history.list_sessions(c.uid, c.req.query))


def h_session(c: Ctx) -> HttpResponse:
    return json_response(200, c.history.get_session(c.uid, c.req.path_params["id"]))


def h_profile(c: Ctx) -> HttpResponse:
    return json_response(200, c.history.latest_profile(c.uid))


def h_label(c: Ctx) -> HttpResponse:
    return json_response(200, c.history.set_label(c.uid, c.req.path_params["id"], v.validate_label_body(c.json())))


def h_export(c: Ctx) -> HttpResponse:
    return HttpResponse(200, json.dumps(c.account.export_json(c.uid), separators=(",", ":")).encode(), headers={"Content-Disposition": 'attachment; filename="formfit-export.json"'})


def h_export_csv(c: Ctx) -> HttpResponse:
    person = v.validate_person_id(c.req.query.get("person_id"))
    text = c.account.export_csv(c.uid, person)
    return HttpResponse(200, text.encode("utf-8"), content_type="text/csv; charset=utf-8", headers={"Content-Disposition": 'attachment; filename="squat_labelled_reps.csv"'})


def h_delete_me(c: Ctx) -> HttpResponse:
    return json_response(200, c.account.delete_account(c.uid, v.validate_password_confirmation(c.json())))


@dataclass(frozen=True)
class Route:
    name: str
    method: str
    pattern: str
    handler: Callable[[Ctx], HttpResponse]
    auth: bool
    summary: str


ROUTES: tuple[Route, ...] = (
    Route("health", "GET", "/health", h_health, False, "Liveness check"),
    Route("signup", "POST", "/auth/signup", h_signup, False, "Create an account"),
    Route("login", "POST", "/auth/login", h_login, False, "Sign in"),
    Route("me", "GET", "/auth/me", h_me, True, "The signed-in user"),
    Route("sync_push", "POST", "/sync/push", h_push, True, "Upload local profiles, sessions, reps (idempotent)"),
    Route("sync_pull", "GET", "/sync/pull", h_pull, True, "Download changes since the cursors"),
    Route("sessions", "GET", "/sessions", h_sessions, True, "Session history with rep counts and averages"),
    Route("session", "GET", "/sessions/{id}", h_session, True, "One session with its reps"),
    Route("profile", "GET", "/profile", h_profile, True, "Latest body profile"),
    Route("rep_label", "PUT", "/reps/{id}/label", h_label, True, "Label a rep good / faulty / none"),
    Route("export", "GET", "/export", h_export, True, "Export all my data (JSON)"),
    Route("export_csv", "GET", "/export.csv", h_export_csv, True, "Export labelled reps (CSV for training)"),
    Route("delete_me", "DELETE", "/me", h_delete_me, True, "Delete my account and all my data"),
)


def _compile(pattern: str) -> re.Pattern[str]:
    return re.compile("^" + re.sub(r"\{(\w+)\}", r"(?P<\1>[A-Za-z0-9_-]{1,64})", pattern.replace(".", r"\.")) + "$")


_COMPILED = tuple((r, _compile(r.pattern)) for r in ROUTES)

_SECURITY_HEADERS = {"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"}


# ----------------------------------------------------------------------------- dispatcher
DbFactory = Callable[[], ContextManager[Database]]


def make_db_factory(settings: Settings) -> DbFactory:
    """In-memory SQLite shares one connection (each connection would otherwise be a different empty database);
    everything else opens a connection per request and closes it afterwards."""
    if settings.database_url in ("sqlite://", "sqlite://:memory:"):
        shared = connect(settings.database_url)

        @contextmanager
        def shared_conn() -> Iterator[Database]:
            yield shared

        return shared_conn

    @contextmanager
    def per_request() -> Iterator[Database]:
        db = connect(settings.database_url)
        try:
            yield db
        finally:
            db.close()

    return per_request


class Dispatcher:
    def __init__(self, settings: Settings, db_factory: DbFactory, now_ms: Callable[[], int] | None = None):
        self.settings = settings
        self.db_factory = db_factory
        self.now_ms = now_ms or (lambda: int(time.time() * 1000))
        self.limiter = LoginRateLimiter(settings.login_max_failures, settings.login_window_s)

    def _match(self, method: str, path: str) -> tuple[Route, dict[str, str]]:
        if not path.startswith(API_PREFIX):
            raise NotFound("Not found.")
        sub = path[len(API_PREFIX):] or "/"
        allowed: list[str] = []
        for route, rx in _COMPILED:
            m = rx.match(sub)
            if m:
                if route.method == method:
                    return route, m.groupdict()
                allowed.append(route.method)
        if allowed:
            err = AppError("Method not allowed.", code="method_not_allowed")
            err.status = 405
            err.details = {"allow": sorted(set(allowed))}
            raise err
        raise NotFound("Not found.")

    def _authenticate(self, req: HttpRequest) -> str:
        header = req.headers.get("authorization", "")
        scheme, _, token = header.partition(" ")
        if scheme.lower() != "bearer" or not token.strip():
            raise AuthError("Sign in to continue.", code="not_authenticated")
        return security.decode_token(token.strip(), self.settings)

    def handle(self, req: HttpRequest) -> HttpResponse:
        try:
            resp = self._handle(req)
        except AppError as e:
            extra = {"Retry-After": str(e.details["retry_after_s"])} if e.status == 429 and "retry_after_s" in e.details else {}
            if e.status == 405:
                extra["Allow"] = ", ".join(e.details.get("allow", []))
            resp = json_response(e.status, e.to_body(), extra)
        except Exception:  # noqa: BLE001 - never leak internals
            log.exception("unhandled error for %s %s", req.method, req.path)
            resp = json_response(500, {"error": {"code": "internal_error", "message": "Something went wrong on our side."}})
        resp.headers = {**_SECURITY_HEADERS, **resp.headers}
        return resp

    def _handle(self, req: HttpRequest) -> HttpResponse:
        route, params = self._match(req.method, req.path)
        if len(req.body) > self.settings.max_body_bytes:
            raise PayloadTooLarge("The request is too large.")
        req.path_params = params
        user_id = self._authenticate(req) if route.auth else None
        with self.db_factory() as db:
            store = Store(db)
            ctx = Ctx(
                req=req, settings=self.settings, user_id=user_id,
                auth=AuthService(store, self.settings, self.limiter, self.now_ms),
                sync=SyncService(store, self.now_ms),
                history=HistoryService(store, self.now_ms),
                account=AccountService(store, self.settings, self.now_ms),
            )
            if route.auth and store.user_by_id(ctx.uid) is None:
                raise AuthError("Invalid credentials.", code="invalid_token")
            try:
                resp = route.handler(ctx)
                db.commit()
                return resp
            except BaseException:
                db.rollback()
                raise
