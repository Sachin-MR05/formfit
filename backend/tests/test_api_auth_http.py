import json

from app.http import HttpRequest
from tests.helpers import Clock, call, make_dispatcher, signup


def test_health_needs_no_auth_and_has_security_headers():
    d = make_dispatcher()
    resp = d.handle(HttpRequest(method="GET", path="/api/health"))
    assert resp.status == 200 and json.loads(resp.body) == {"status": "ok"}
    assert resp.headers["Cache-Control"] == "no-store" and resp.headers["X-Content-Type-Options"] == "nosniff"


def test_signup_login_me_flow():
    d = make_dispatcher()
    status, body = call(d, "POST", "/auth/signup", {"email": "Ann@Example.com", "password": "correct horse", "accept_terms": True, "display_name": "Ann"})
    assert status == 201
    assert body["user"]["email"] == "ann@example.com" and body["token_type"] == "bearer" and body["expires_in"] > 0
    assert "password" not in json.dumps(body) and "password_hash" not in json.dumps(body)
    token = body["access_token"]
    assert call(d, "GET", "/auth/me", token=token)[1]["user"]["display_name"] == "Ann"
    status, body = call(d, "POST", "/auth/login", {"email": "ann@example.com", "password": "correct horse"})
    assert status == 200 and call(d, "GET", "/auth/me", token=body["access_token"])[0] == 200


def test_duplicate_email_is_a_conflict():
    d = make_dispatcher()
    signup(d, "a@example.com")
    status, body = call(d, "POST", "/auth/signup", {"email": "A@example.com", "password": "another one!", "accept_terms": True})
    assert status == 409 and body["error"]["code"] == "email_taken"


def test_wrong_password_and_unknown_email_look_identical():
    d = make_dispatcher()
    signup(d, "a@example.com")
    s1, b1 = call(d, "POST", "/auth/login", {"email": "a@example.com", "password": "wrong-password"})
    s2, b2 = call(d, "POST", "/auth/login", {"email": "ghost@example.com", "password": "wrong-password"})
    assert s1 == s2 == 401 and b1 == b2 and b1["error"]["code"] == "invalid_credentials"


def test_login_is_throttled_after_repeated_failures():
    d = make_dispatcher()  # limit is 3 in test settings
    signup(d, "a@example.com")
    for _ in range(3):
        assert call(d, "POST", "/auth/login", {"email": "a@example.com", "password": "nope-nope"})[0] == 401
    resp = d.handle(HttpRequest(method="POST", path="/api/auth/login", body=json.dumps({"email": "a@example.com", "password": "correct horse"}).encode(), client_ip="1.2.3.4"))
    assert resp.status == 429 and int(resp.headers["Retry-After"]) >= 1
    # another client address is not affected
    assert call(d, "POST", "/auth/login", {"email": "a@example.com", "password": "correct horse"}, ip="9.9.9.9")[0] == 200


def test_authentication_failures():
    d = make_dispatcher()
    assert call(d, "GET", "/auth/me")[1]["error"]["code"] == "not_authenticated"
    assert call(d, "GET", "/auth/me", token="garbage")[1]["error"]["code"] == "invalid_token"
    resp = d.handle(HttpRequest(method="GET", path="/api/auth/me", headers={"authorization": "Basic abc"}))
    assert resp.status == 401


def test_token_expires_with_the_clock_of_creation():
    d = make_dispatcher(token_ttl_s=-10)  # tokens are born expired
    token = signup(d)
    status, body = call(d, "GET", "/auth/me", token=token)
    assert status == 401 and body["error"]["code"] == "token_expired"


def test_bad_bodies_and_routes():
    d = make_dispatcher()
    assert call(d, "POST", "/auth/login", raw=b"{not json")[1]["error"]["code"] == "validation_error"
    assert call(d, "POST", "/auth/login", raw=b"")[0] == 422
    assert call(d, "POST", "/auth/login", raw=b"\xff\xfe")[0] == 422
    assert call(d, "GET", "/nope")[0] == 404
    status, _ = call(d, "DELETE", "/health")
    assert status == 405
    assert d.handle(HttpRequest(method="GET", path="/other")).status == 404


def test_oversized_request_is_refused():
    d = make_dispatcher(max_body_bytes=100)
    assert call(d, "POST", "/auth/login", raw=b"x" * 101)[0] == 413


def test_unexpected_errors_never_leak_internals():
    import app.http as h

    d = make_dispatcher()
    original = h._COMPILED
    def boom(_c):
        raise RuntimeError("secret internal detail: password=hunter2")
    h._COMPILED = tuple((h.Route(r.name, r.method, r.pattern, boom, r.auth, r.summary) if r.name == "health" else r, rx) for r, rx in original)
    try:
        status, body = call(d, "GET", "/health")
    finally:
        h._COMPILED = original
    assert status == 500 and body["error"]["code"] == "internal_error" and "hunter2" not in json.dumps(body)


def test_failed_requests_roll_back_their_writes():
    d = make_dispatcher()
    token = signup(d)
    bad = {"sessions": [{"id": "sess-0001", "updated_at": 1_760_000_000_000, "deleted": True}], "reps": [{"id": "x"}]}
    assert call(d, "POST", "/sync/push", bad, token=token)[0] == 422  # validation fails before any write
    assert call(d, "GET", "/sessions", token=token)[1]["sessions"] == []


def test_unknown_emails_still_pay_for_a_password_hash():
    """Otherwise response time would reveal which emails have accounts."""
    from app import security

    d = make_dispatcher()
    signup(d, "a@example.com")
    calls = []
    original = security.dummy_verify
    security.dummy_verify = lambda pw, settings: calls.append(pw)  # type: ignore[assignment]
    try:
        call(d, "POST", "/auth/login", {"email": "ghost@example.com", "password": "whatever-1"})
        call(d, "POST", "/auth/login", {"email": "a@example.com", "password": "wrong-pass-1"})
    finally:
        security.dummy_verify = original  # type: ignore[assignment]
    assert calls == ["whatever-1"]
