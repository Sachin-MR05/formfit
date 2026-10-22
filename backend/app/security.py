"""Passwords (scrypt from the standard library) and JWT access tokens (PyJWT)."""
from __future__ import annotations

import base64
import hashlib
import hmac
import os
import time

import jwt

from .config import Settings
from .errors import AuthError

_MAXMEM = 256 * 1024 * 1024
_DKLEN = 32


def _b64(b: bytes) -> str:
    return base64.b64encode(b).decode("ascii")


def hash_password(password: str, *, n: int, r: int, p: int) -> str:
    """`scrypt$N$r$p$salt$hash`: the cost parameters travel with the hash so they can be raised later."""
    salt = os.urandom(16)
    dk = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=n, r=r, p=p, maxmem=_MAXMEM, dklen=_DKLEN)
    return f"scrypt${n}${r}${p}${_b64(salt)}${_b64(dk)}"


def _parse(stored: str) -> tuple[int, int, int, bytes, bytes] | None:
    try:
        scheme, n, r, p, salt, dk = stored.split("$")
        if scheme != "scrypt":
            return None
        return int(n), int(r), int(p), base64.b64decode(salt), base64.b64decode(dk)
    except (ValueError, TypeError):
        return None


def verify_password(password: str, stored: str) -> bool:
    parsed = _parse(stored)
    if parsed is None:
        return False
    n, r, p, salt, expected = parsed
    try:
        dk = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=n, r=r, p=p, maxmem=_MAXMEM, dklen=len(expected))
    except ValueError:
        return False
    return hmac.compare_digest(dk, expected)


def needs_rehash(stored: str, *, n: int, r: int, p: int) -> bool:
    parsed = _parse(stored)
    return parsed is None or (parsed[0], parsed[1], parsed[2]) != (n, r, p)


_dummy_cache: dict[tuple[int, int, int], str] = {}


def dummy_verify(password: str, settings: Settings) -> None:
    """Spend the same time as a real check so unknown emails cannot be told apart by response time."""
    key = (settings.scrypt_n, settings.scrypt_r, settings.scrypt_p)
    if key not in _dummy_cache:
        _dummy_cache[key] = hash_password("dummy-password", n=key[0], r=key[1], p=key[2])
    verify_password(password, _dummy_cache[key])


# ----------------------------------------------------------------------------- tokens
def create_token(user_id: str, settings: Settings, now: float | None = None) -> str:
    t = int(time.time() if now is None else now)
    claims = {"sub": user_id, "iat": t, "exp": t + settings.token_ttl_s, "iss": settings.issuer}
    return jwt.encode(claims, settings.secret_key, algorithm="HS256")


def decode_token(token: str, settings: Settings) -> str:
    """Returns the user id. Only HS256 is accepted (never the token's own `alg` claim)."""
    try:
        claims = jwt.decode(
            token,
            settings.secret_key,
            algorithms=["HS256"],
            issuer=settings.issuer,
            options={"require": ["exp", "iat", "sub", "iss"]},
        )
    except jwt.ExpiredSignatureError as e:
        raise AuthError("Your session has expired. Please sign in again.", code="token_expired") from e
    except jwt.PyJWTError as e:
        raise AuthError("Invalid credentials.", code="invalid_token") from e
    sub = claims.get("sub")
    if not isinstance(sub, str) or not sub:
        raise AuthError("Invalid credentials.", code="invalid_token")
    return sub
