"""The error vocabulary: every expected failure is an AppError with an HTTP status and a stable machine code."""
from __future__ import annotations

from typing import Any


class AppError(Exception):
    status = 500
    code = "internal_error"

    def __init__(self, message: str, *, code: str | None = None, details: dict[str, Any] | None = None):
        super().__init__(message)
        self.message = message
        if code:
            self.code = code
        self.details = details or {}

    def to_body(self) -> dict[str, Any]:
        err: dict[str, Any] = {"code": self.code, "message": self.message}
        if self.details:
            err["details"] = self.details
        return {"error": err}


class ValidationError(AppError):
    status = 422
    code = "validation_error"


class AuthError(AppError):
    status = 401
    code = "unauthorized"


class Forbidden(AppError):
    status = 403
    code = "forbidden"


class NotFound(AppError):
    status = 404
    code = "not_found"


class Conflict(AppError):
    status = 409
    code = "conflict"


class PayloadTooLarge(AppError):
    status = 413
    code = "payload_too_large"


class RateLimited(AppError):
    status = 429
    code = "rate_limited"
