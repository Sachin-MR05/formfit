# FormFit backend (Phase 4): FastAPI + PostgreSQL

Accounts, saved sessions and reps, and sync between devices. The browser still does all pose tracking and scoring;
the server only stores numbers (never video).

## Run it

**With Docker (PostgreSQL included)**
```bash
cd backend
export FORMFIT_SECRET_KEY=$(python -c "import secrets;print(secrets.token_urlsafe(48))")
docker compose up --build            # API on http://localhost:8000  (docs: /api/docs)
python scripts/smoke_test.py http://localhost:8000
```

**Without Docker**
```bash
cd backend
python -m venv .venv && source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                     # then export the variables (or set them in your shell)
# quick try with SQLite:   export FORMFIT_DATABASE_URL=sqlite:///./formfit-dev.db
uvicorn app.main:app --reload
python scripts/smoke_test.py http://localhost:8000
```
Migrations (`migrations/*.sql`) are applied automatically at start-up.

Then, in `frontend/.env.local`: `VITE_API_URL=http://localhost:8000` and restart `npm run dev`.

## Tests
```bash
pip install pytest && pytest                  # or, with no dependencies at all:  python tests/run_all.py
```
64 tests: password hashing and tokens (including forged/expired/`alg: none` tokens), strict validation, login
throttling, the complete HTTP behaviour, idempotent sync, last-writer-wins, deletion tombstones, per-user isolation,
pagination, exports, account deletion, transaction rollback, and the migration runner.

## How it is built
```
app/config.py, errors.py      settings (fails fast in production without a real secret), error vocabulary
app/security.py, ratelimit.py scrypt passwords (standard library), JWT (HS256 only), login throttling
app/validation.py             strict input checking with exact field paths
app/db.py, repo.py            SQL (portable subset: SQLite for tests, PostgreSQL in production), atomic upserts
app/services.py               auth, sync, history, export, account deletion
app/http.py                   route table + framework-free Dispatcher (auth, JSON, limits, transactions, errors)
app/api.py                    thin FastAPI adapter (CORS, start-up migrations)
```
Almost everything is tested against SQLite through the Dispatcher. The two pieces that need the real stack
(`app/api.py` and `PostgresDatabase` in `app/db.py`, together under 100 lines) are checked by `scripts/smoke_test.py`.

## Sync model
- Clients create ids (UUIDs), so pushing is **idempotent**: retrying after a network failure never duplicates anything.
- **Last writer wins** per record, by the client's `updated_at`. An older version never overwrites a newer one.
- Deleting a session sends a **tombstone**. The server deletes the reps and scrubs the file name, and other devices learn
  of the deletion on their next pull. A deleted session cannot be resurrected by a stale device.
- Pull uses a keyset cursor per record type (`updated_at`, `id`), so large histories page reliably.
- Users can only ever read or write their own rows (ownership is checked in the service and again in the SQL).

## Security notes
- Passwords: scrypt (N=2^15, r=8, p=1 by default) with a per-user salt; parameters are stored in the hash so they can be
  raised later (hashes are upgraded at the next login). Login answers are identical for unknown email vs wrong password,
  and unknown emails still pay for a hash.
- Tokens: HS256 JWT, 14 days by default. They are kept by the web app in `localStorage`, which a cross-site-scripting bug
  could read; the app has no third-party scripts, but if you later want stronger protection move to an httpOnly cookie.
- Login throttling is in memory (one process). Use Redis or a database table if you run several workers.
- **Not built yet:** email verification, password reset, refresh tokens/revocation, an admin or trainer role.
- Behind a proxy run with `--proxy-headers` and terminate HTTPS there. Camera access in browsers requires HTTPS in production.
- Postgres connections are opened per request. For real traffic put PgBouncer in front or add a pool.
