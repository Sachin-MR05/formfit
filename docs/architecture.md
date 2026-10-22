# Python ↔ frontend contract

```
ml/formfit_ml  ──(export_for_frontend.py)──►  frontend/src/engine/generated/
   train, simulate,                             model.v1.json   trained networks + metadata + version hash
   reference logic                              config.json     every threshold
                                                fixtures.json   cases computed by the Python reference
                                                      │
                                                      ▼
                              frontend/src/engine (TypeScript)  ── parity tests must reproduce fixtures.json
```

**Rule:** thresholds and weights are defined only in Python. TypeScript never hard-codes them; it reads `config.json`
and `model.v1.json`. If the TypeScript logic drifts from Python, `npm test` fails.

## Workflow when something changes
1. Edit Python (`ml/formfit_ml/`), run `python ml/tests/test_engine_reference.py`.
2. `cd frontend && npm run sync:ml` (re-trains, re-exports model, config **and** fixtures).
3. `npm test`: the engine must still match Python. If you changed logic in Python, port it to TypeScript until green.
4. Commit the regenerated `generated/` files together with the code change.

## Versioning
`model_version` (`squat-mlp-v1+<hash of the weights>`) is stored in `model.v1.json`, `config.json` and `fixtures.json`
and will be saved with every rep in the database (Phase 4), so old reps can always be traced to the model that scored them.

## Using real data
Collect labelled reps with the app's CSV export (later: from the database), then:
`python ml/scripts/export_for_frontend.py --csv reps1.csv reps2.csv`.
Columns: `person_id, rep_id, knee, hip, torso, shank, phi, femur_torso, shank_femur, leg_torso, label`.

## Phase 4 note
The FastAPI backend can `import formfit_ml` to re-score stored reps server-side with exactly the same logic.
