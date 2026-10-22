"""Run the whole suite without pytest:  python tests/run_all.py   (pytest also works: `pytest`)."""
import importlib
import os
import pkgutil
import sys
import traceback

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import tests  # noqa: E402

passed = failed = 0
for mod in sorted(m.name for m in pkgutil.iter_modules(tests.__path__) if m.name.startswith("test_")):
    module = importlib.import_module(f"tests.{mod}")
    for name in sorted(n for n in dir(module) if n.startswith("test_") and callable(getattr(module, n))):
        fn = getattr(module, name)
        if fn.__module__ != module.__name__:
            continue
        try:
            fn()
            passed += 1
        except Exception:  # noqa: BLE001
            failed += 1
            print(f"FAIL {mod}::{name}")
            traceback.print_exc(limit=4)
print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
