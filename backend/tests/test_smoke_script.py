"""Runs the real smoke script against the stdlib server: proves the script itself works before anyone points it at FastAPI."""
import importlib.util
import os

from tests.helpers import make_dispatcher
from tests.http_server import serve


def _load_smoke():
    path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "scripts", "smoke_test.py")
    spec = importlib.util.spec_from_file_location("smoke_test", path)
    mod = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
    spec.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod


def test_smoke_script_passes_against_the_stdlib_server():
    d = make_dispatcher(clock=None, login_max_failures=50)
    server, base = serve(d)
    try:
        _load_smoke().run(base)
    finally:
        server.shutdown()
