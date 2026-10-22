"""Starts the real Dispatcher on a free port (in-memory SQLite, real clock) for the TypeScript end-to-end test.
Prints `LISTENING <url>` and then runs until killed. Not a test itself and not for production."""
import os
import sys
import threading

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import migrate  # noqa: E402
from app.http import Dispatcher, make_db_factory  # noqa: E402
from tests.helpers import test_settings  # noqa: E402
from tests.http_server import serve  # noqa: E402

settings = test_settings(login_max_failures=20)
dispatcher = Dispatcher(settings, make_db_factory(settings))
with dispatcher.db_factory() as db:
    migrate(db, settings.migrations_dir)
server, base = serve(dispatcher)
print(f"LISTENING {base}", flush=True)
threading.Event().wait()
