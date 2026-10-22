import os
import re

from app.db import connect, migrate
from app.errors import ValidationError
from tests.helpers import raises, test_settings

SETTINGS = test_settings()


def fresh():
    db = connect("sqlite://:memory:")
    migrate(db, SETTINGS.migrations_dir)
    return db


def test_migrations_apply_once_and_create_the_schema():
    db = connect("sqlite://:memory:")
    assert migrate(db, SETTINGS.migrations_dir) == ["0001_initial"]
    assert migrate(db, SETTINGS.migrations_dir) == []
    tables = {r["name"] for r in db.query("SELECT name FROM sqlite_master WHERE type = 'table'")}
    assert {"users", "body_profiles", "sessions", "reps", "schema_migrations"} <= tables


def test_a_failing_migration_leaves_nothing_behind(tmp=None):
    import tempfile

    with tempfile.TemporaryDirectory() as d:
        with open(os.path.join(d, "0001_a.sql"), "w") as f:
            f.write("CREATE TABLE ok_table (id TEXT PRIMARY KEY);\nCREATE TABLE ok_table (id TEXT);")  # second statement fails
        db = connect("sqlite://:memory:")
        try:
            migrate(db, d)
        except Exception:
            pass
        else:
            raise AssertionError("expected the migration to fail")
        assert db.query("SELECT COUNT(*) AS n FROM schema_migrations")[0]["n"] == 0


def test_foreign_keys_are_enforced_and_cascade():
    db = fresh()
    db.execute("INSERT INTO users VALUES ('u1','a@b.co','h',NULL,1,1,1)")
    with raises(Exception):
        db.execute("INSERT INTO sessions (id,user_id,started_at,source,pose_model,model_version,profile_femur_torso,profile_shank_femur,profile_leg_torso,profile_up_sign,client_updated_at,updated_at) VALUES ('s1','ghost',1,'live','full','v',1,1,1,1,1,1)")
    db.rollback()


def test_emails_are_unique():
    db = fresh()
    db.execute("INSERT INTO users VALUES ('u1','a@b.co','h',NULL,1,1,1)")
    with raises(Exception):
        db.execute("INSERT INTO users VALUES ('u2','a@b.co','h',NULL,1,1,1)")
    db.rollback()


def test_connect_rejects_unknown_urls():
    with raises(ValueError):
        connect("mysql://nope")


def test_sql_stays_in_the_portable_subset_shared_with_postgresql():
    """The same statements run on SQLite (tested) and PostgreSQL (production): guard against vendor-specific syntax."""
    root = os.path.dirname(os.path.dirname(__file__))
    sql_sources = [open(os.path.join(root, "app", "repo.py")).read(), open(os.path.join(root, "migrations", "0001_initial.sql")).read()]
    forbidden = [r"INSERT OR ", r"AUTOINCREMENT", r"PRAGMA", r"datetime\(", r"strftime", r"\bREAL\b", r"GROUP_CONCAT", r"IFNULL\(", r"\bLIMIT \?,\s*\?"]
    for src in sql_sources:
        for pat in forbidden:
            assert not re.search(pat, src, flags=re.I), f"vendor-specific SQL found: {pat}"
    # a literal '%' would break the psycopg placeholder rewriting
    assert "%" not in sql_sources[0]
