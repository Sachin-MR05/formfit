"""FormFit ML package: single source of truth for the scoring model and thresholds.

The website runs a TypeScript port of this logic in the browser. `export.py` writes the trained
weights, the thresholds and a set of parity fixtures; the frontend tests then assert that the
TypeScript engine reproduces these Python results.
"""
