import base64
import json

import jwt

from app import security
from app.errors import AuthError
from tests.helpers import raises, test_settings

S = test_settings()


def test_password_hash_and_verify():
    h = security.hash_password("correct horse", n=2**10, r=8, p=1)
    assert h.startswith("scrypt$1024$8$1$")
    assert security.verify_password("correct horse", h)
    assert not security.verify_password("wrong", h)
    assert not security.verify_password("", h)


def test_hashes_are_salted():
    a = security.hash_password("same", n=2**10, r=8, p=1)
    b = security.hash_password("same", n=2**10, r=8, p=1)
    assert a != b


def test_verify_rejects_garbage_hashes_without_raising():
    for bad in ["", "nonsense", "bcrypt$1$2$3$4$5", "scrypt$x$8$1$AAAA$AAAA", "scrypt$1024$8$1$!!$!!"]:
        assert security.verify_password("x", bad) is False


def test_needs_rehash_when_cost_changes():
    h = security.hash_password("pw", n=2**10, r=8, p=1)
    assert not security.needs_rehash(h, n=2**10, r=8, p=1)
    assert security.needs_rehash(h, n=2**11, r=8, p=1)
    assert security.needs_rehash("garbage", n=2**10, r=8, p=1)


def test_unicode_passwords_work():
    h = security.hash_password("pässwörd-密码", n=2**10, r=8, p=1)
    assert security.verify_password("pässwörd-密码", h)


def test_token_round_trip():
    tok = security.create_token("user-123", S)
    assert security.decode_token(tok, S) == "user-123"


def test_expired_token():
    tok = security.create_token("u", S, now=1_000_000)  # long ago
    with raises(AuthError, "expired"):
        security.decode_token(tok, S)


def test_token_signed_with_another_key_is_rejected():
    tok = security.create_token("u", test_settings(secret_key="z" * 40))
    with raises(AuthError):
        security.decode_token(tok, S)


def test_tampered_token_is_rejected():
    tok = security.create_token("u", S)
    head, payload, sig = tok.split(".")
    forged = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    forged["sub"] = "someone-else"
    p2 = base64.urlsafe_b64encode(json.dumps(forged).encode()).rstrip(b"=").decode()
    with raises(AuthError):
        security.decode_token(f"{head}.{p2}.{sig}", S)


def test_alg_none_token_is_rejected():
    forged = jwt.encode({"sub": "u", "iat": 1, "exp": 9_999_999_999, "iss": "formfit"}, key=None, algorithm="none")
    with raises(AuthError):
        security.decode_token(forged, S)


def test_wrong_issuer_and_missing_claims_are_rejected():
    bad_iss = jwt.encode({"sub": "u", "iat": 1, "exp": 9_999_999_999, "iss": "evil"}, S.secret_key, algorithm="HS256")
    no_sub = jwt.encode({"iat": 1, "exp": 9_999_999_999, "iss": "formfit"}, S.secret_key, algorithm="HS256")
    for tok in (bad_iss, no_sub, "not-a-jwt", ""):
        with raises(AuthError):
            security.decode_token(tok, S)
