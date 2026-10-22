import math

from app import validation as v
from app.config import DEV_SECRET, Settings
from app.errors import ValidationError
from app.ratelimit import LoginRateLimiter
from app.errors import RateLimited
from tests.helpers import profile, raises, rep, session


# ------------------------------------------------------------------ credentials
def test_signup_normalises_email_and_requires_terms():
    d = v.validate_signup({"email": "  Me@Example.COM ", "password": "12345678", "accept_terms": True, "display_name": "  Sam "})
    assert d["email"] == "me@example.com" and d["display_name"] == "Sam"
    with raises(ValidationError, "accept_terms"):
        v.validate_signup({"email": "a@b.co", "password": "12345678"})
    with raises(ValidationError, "password"):
        v.validate_signup({"email": "a@b.co", "password": "short", "accept_terms": True})
    with raises(ValidationError, "email"):
        v.validate_signup({"email": "nope", "password": "12345678", "accept_terms": True})
    with raises(ValidationError):
        v.validate_signup([1, 2])


def test_login_validation():
    assert v.validate_login({"email": "A@b.co", "password": "x"})["email"] == "a@b.co"
    with raises(ValidationError):
        v.validate_login({"email": "a@b.co", "password": ""})
    with raises(ValidationError):
        v.validate_login({"email": 5, "password": "x"})


# ------------------------------------------------------------------ records
def test_valid_records_pass_and_are_normalised():
    assert v.validate_profile(profile())["femur_torso"] == 0.94
    s = v.validate_session(session())
    assert s["profile"]["up_sign"] == -1 and s["deleted"] is False
    r = v.validate_rep(rep(codes=["torso_forward", "torso_forward"]))
    assert r["codes"] == ["torso_forward"]  # de-duplicated


def test_tombstone_needs_only_id_and_time():
    t = v.validate_session({"id": "sess-0001", "updated_at": session()["updated_at"], "deleted": True})
    assert t == {"id": "sess-0001", "updated_at": session()["updated_at"], "deleted": True}


def test_numbers_must_be_real_finite_and_in_range():
    for bad in (True, "5", None, math.nan, math.inf, 1e9):
        with raises(ValidationError):
            v.validate_rep(rep(score=bad))
    with raises(ValidationError, "features.knee"):
        v.validate_rep(rep(features={"knee": 999, "hip": 1, "torso": 1, "shank": 1, "phi": 1}))
    with raises(ValidationError, "personalized"):
        v.validate_rep(rep(personalized=1.5))
    with raises(ValidationError, "score"):
        v.validate_rep(rep(score=80.5))


def test_enums_ids_and_timestamps_are_checked():
    for over in ({"label": "maybe"}, {"codes": ["made_up"]}, {"rule_reasons": ["x"]}, {"id": "bad id!"}, {"id": "short"}, {"created_at": 5}, {"index": 0}):
        with raises(ValidationError):
            v.validate_rep(rep(**over))
    with raises(ValidationError, "source"):
        v.validate_session(session(source="drone"))
    with raises(ValidationError):
        v.validate_profile(profile(up_sign=0))


def test_error_names_the_exact_path():
    try:
        v.validate_push({"reps": [rep(), rep(rid="rep-00002", score=500)]})
    except ValidationError as e:
        assert e.details["field"] == "reps[1].score"
    else:
        raise AssertionError("expected a ValidationError")


def test_push_size_limits():
    with raises(ValidationError, "at most"):
        v.validate_push({"reps": [rep(rid=f"rep-{i:05d}") for i in range(v.MAX_REPS_PER_PUSH + 1)]})
    with raises(ValidationError):
        v.validate_push({"reps": "nope"})
    assert v.validate_push({}) == {"profiles": [], "sessions": [], "reps": []}


def test_cursor_and_limit_parsing():
    assert v.parse_cursor(None, "c") == (0, "")
    assert v.parse_cursor("123:abc-1", "c") == (123, "abc-1")
    for bad in ("x", "12", "-1:a", "1:" + "a" * 70, "1:a b"):
        with raises(ValidationError):
            v.parse_cursor(bad, "c")
    assert v.parse_limit(None) == 500 and v.parse_limit("10") == 10
    for bad in ("0", "-5", "abc", "100000"):
        with raises(ValidationError):
            v.parse_limit(bad)


def test_label_and_person_id():
    assert v.validate_label_body({"label": None}) is None and v.validate_label_body({"label": "good"}) == "good"
    with raises(ValidationError):
        v.validate_label_body({})
    with raises(ValidationError):
        v.validate_label_body({"label": "bad"})
    assert v.validate_person_id(None) == "p01" and v.validate_person_id("ann_2") == "ann_2"
    with raises(ValidationError):
        v.validate_person_id("a,b")


# ------------------------------------------------------------------ config
def test_production_requires_a_real_secret_and_explicit_origins():
    ok = {"FORMFIT_ENV": "production", "FORMFIT_SECRET_KEY": "s" * 40, "FORMFIT_CORS_ORIGINS": "https://app.example.com"}
    assert Settings.from_env(ok).is_production
    for bad in ({**ok, "FORMFIT_SECRET_KEY": "short"}, {**ok, "FORMFIT_SECRET_KEY": DEV_SECRET}, {**ok, "FORMFIT_CORS_ORIGINS": "*"}, {**ok, "FORMFIT_ENV": "staging"}):
        with raises(ValueError):
            Settings.from_env(bad)


def test_development_has_a_safe_default_and_parses_options():
    s = Settings.from_env({"FORMFIT_CORS_ORIGINS": "http://a.test, http://b.test", "FORMFIT_TOKEN_TTL_DAYS": "7"})
    assert s.secret_key == DEV_SECRET and s.cors_origins == ("http://a.test", "http://b.test") and s.token_ttl_s == 7 * 86400
    with raises(ValueError):
        Settings.from_env({"FORMFIT_TOKEN_TTL_DAYS": "500"})


# ------------------------------------------------------------------ rate limiter
def test_rate_limiter_blocks_then_recovers():
    t = [0.0]
    lim = LoginRateLimiter(3, 60, clock=lambda: t[0])
    for _ in range(3):
        lim.check("k")
        lim.record_failure("k")
    with raises(RateLimited):
        lim.check("k")
    lim.check("other")  # other keys unaffected
    t[0] = 61
    lim.check("k")  # window passed


def test_rate_limiter_reset_on_success_and_retry_after():
    t = [100.0]
    lim = LoginRateLimiter(2, 60, clock=lambda: t[0])
    lim.record_failure("k")
    lim.record_failure("k")
    try:
        lim.check("k")
    except RateLimited as e:
        assert 1 <= e.details["retry_after_s"] <= 60
    lim.reset("k")
    lim.check("k")
