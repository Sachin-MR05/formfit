"""Database access behind a tiny interface: SQLite (tests, quick local tries) and PostgreSQL (production).

All SQL in the project uses `?` placeholders and the portable subset (ON CONFLICT upserts, no vendor functions),
so the same statements run on both. The PostgreSQL driver rewrites `?` to `%s`.
"""
from __future__ import annotations

import os
import re
import sqlite3
import time
from contextlib import contextmanager
from typing import Any, Callable, Iterator, Protocol, Sequence


class Database(Protocol):
    dialect: str

    def execute(self, sql: str, params: Sequence[Any] = ()) -> int: ...
    def query(self, sql: str, params: Sequence[Any] = ()) -> list[dict[str, Any]]: ...
    def commit(self) -> None: ...
    def rollback(self) -> None: ...
    def close(self) -> None: ...


class SqliteDatabase:
    dialect = "sqlite"

    def __init__(self, path: str):
        self._conn = sqlite3.connect(path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA foreign_keys = ON")
        if path != ":memory:":
            self._conn.execute("PRAGMA journal_mode = WAL")

    def execute(self, sql: str, params: Sequence[Any] = ()) -> int:
        return self._conn.execute(sql, tuple(params)).rowcount

    def query(self, sql: str, params: Sequence[Any] = ()) -> list[dict[str, Any]]:
        return [dict(r) for r in self._conn.execute(sql, tuple(params)).fetchall()]

    def commit(self) -> None:
        self._conn.commit()

    def rollback(self) -> None:
        self._conn.rollback()

    def close(self) -> None:
        self._conn.close()


class PostgresDatabase:
    dialect = "postgresql"

    def __init__(self, url: str):
        import psycopg  # imported lazily so SQLite-only environments (tests) do not need it
        from psycopg.rows import dict_row

        self._conn = psycopg.connect(url, row_factory=dict_row)

    @staticmethod
    def _sql(sql: str) -> str:
        assert "%" not in sql, "literal % is not allowed in SQL (placeholder rewriting)"
        return sql.replace("?", "%s")

    def execute(self, sql: str, params: Sequence[Any] = ()) -> int:
        cur = self._conn.execute(self._sql(sql), tuple(params))
        return cur.rowcount

    def query(self, sql: str, params: Sequence[Any] = ()) -> list[dict[str, Any]]:
        return list(self._conn.execute(self._sql(sql), tuple(params)).fetchall())

    def commit(self) -> None:
        self._conn.commit()

    def rollback(self) -> None:
        self._conn.rollback()

    def close(self) -> None:
        self._conn.close()


def connect(database_url: str) -> Database:
    if database_url.startswith("sqlite:///"):
        return SqliteDatabase(database_url[len("sqlite:///"):] or ":memory:")
    if database_url in ("sqlite://", "sqlite://:memory:"):
        return SqliteDatabase(":memory:")
    if database_url.startswith(("postgresql://", "postgres://")):
        return PostgresDatabase(database_url)
    raise ValueError("FORMFIT_DATABASE_URL must start with postgresql:// or sqlite:///")


def migrate(db: Database, migrations_dir: str, now_ms: Callable[[], int] = lambda: int(time.time() * 1000)) -> list[str]:
    """Apply the not-yet-applied *.sql files in name order. Each file runs in one transaction. Returns what was applied."""
    db.execute("CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at BIGINT NOT NULL)")
    db.commit()
    done = {r["version"] for r in db.query("SELECT version FROM schema_migrations")}
    applied: list[str] = []
    for name in sorted(f for f in os.listdir(migrations_dir) if f.endswith(".sql")):
        version = name[: -len(".sql")]
        if version in done:
            continue
        with open(os.path.join(migrations_dir, name), encoding="utf-8") as fh:
            script = fh.read()
        statements = [s.strip() for s in re.split(r";\s*(?:\n|$)", re.sub(r"--[^\n]*", "", script)) if s.strip()]
        try:
            for stmt in statements:
                db.execute(stmt)
            db.execute("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)", (version, now_ms()))
            db.commit()
        except Exception:
            db.rollback()
            raise
        applied.append(version)
    return applied


@contextmanager
def transaction(db: Database) -> Iterator[Database]:
    """Commit on success, roll back on any exception."""
    try:
        yield db
        db.commit()
    except BaseException:
        db.rollback()
        raise
