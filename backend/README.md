# backend/ — FastAPI + PostgreSQL (Phase 4)

Intentionally empty for now: the Live Coach prototype (Phases 1–3) needs no server.

## Planned layout
```
backend/
├─ app/
│  ├─ main.py            FastAPI app
│  ├─ core/              settings, security (JWT, password hashing)
│  ├─ models/            SQLAlchemy: users, body_profiles, sessions, reps, labels
│  ├─ schemas/           Pydantic request/response models
│  ├─ routers/           auth, profiles, sessions, reps, export
│  └─ db.py
├─ alembic/              migrations
├─ tests/                pytest
└─ pyproject.toml
```

## Core tables
`users`, `body_profiles` (ratios, side, calibration quality, version), `sessions` (source live/upload, pose model),
`reps` (8 features, score, issue tags, generic score, rule verdict, `model_version`, tempo), `labels` (coach GOOD/FAULTY).

## Rules
- Store numbers only, never video.
- Every user can read only their own rows.
- Provide "export my data" and "delete my data".
