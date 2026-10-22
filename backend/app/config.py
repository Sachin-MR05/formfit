"""Settings from environment variables (no third-party settings library needed)."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Mapping

DEV_SECRET = "dev-only-insecure-secret-do-not-use-in-production-0123456789"


@dataclass(frozen=True)
class Settings:
    env: str = "development"
    database_url: str = "sqlite:///./formfit-dev.db"
    secret_key: str = DEV_SECRET
    issuer: str = "formfit"
    token_ttl_s: int = 14 * 24 * 3600
    cors_origins: tuple[str, ...] = ("http://localhost:5173",)
    # scrypt cost (memory = 128 * n * r bytes). Tests lower n; production keeps the default.
    scrypt_n: int = 2**15
    scrypt_r: int = 8
    scrypt_p: int = 1
    max_body_bytes: int = 2_000_000
    login_max_failures: int = 5
    login_window_s: int = 900
    migrations_dir: str = field(default_factory=lambda: os.path.join(os.path.dirname(os.path.dirname(__file__)), "migrations"))

    @property
    def is_production(self) -> bool:
        return self.env == "production"

    @staticmethod
    def from_env(environ: Mapping[str, str] | None = None) -> "Settings":
        e = os.environ if environ is None else environ
        env = e.get("FORMFIT_ENV", "development").strip().lower()
        if env not in ("development", "production", "test"):
            raise ValueError("FORMFIT_ENV must be development, production or test")
        secret = e.get("FORMFIT_SECRET_KEY", "")
        if env == "production":
            if len(secret) < 32 or secret == DEV_SECRET:
                raise ValueError("FORMFIT_SECRET_KEY must be set to a random string of at least 32 characters in production")
        elif not secret:
            secret = DEV_SECRET
        origins = tuple(o.strip() for o in e.get("FORMFIT_CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip())
        if env == "production" and "*" in origins:
            raise ValueError("FORMFIT_CORS_ORIGINS must list explicit origins in production, not '*'")
        ttl_days = float(e.get("FORMFIT_TOKEN_TTL_DAYS", "14"))
        if not 0 < ttl_days <= 90:
            raise ValueError("FORMFIT_TOKEN_TTL_DAYS must be between 0 and 90")
        return Settings(
            env=env,
            database_url=e.get("FORMFIT_DATABASE_URL", "sqlite:///./formfit-dev.db"),
            secret_key=secret,
            token_ttl_s=int(ttl_days * 24 * 3600),
            cors_origins=origins,
        )
