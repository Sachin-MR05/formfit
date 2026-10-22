"""FormFit backend.

Layering (each layer only depends on the ones above it):
  config, errors          settings and the error vocabulary
  security, ratelimit     passwords (scrypt), JWT, login throttling
  validation              strict checking of everything that comes in
  db, repo                SQL access (SQLite for tests/dev, PostgreSQL in production)
  services                business rules: auth, sync (idempotent, last-writer-wins), history, export, account
  routes, http            the HTTP contract and a framework-free dispatcher
  api                     the FastAPI shell (thin adapter over http.Dispatcher)
"""
