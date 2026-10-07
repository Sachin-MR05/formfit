# ml/ — models, simulator, export

```
ml/
├─ formfit_ml/        config (all thresholds), geometry, simulate, train, coach, tracker, export
├─ scripts/export_for_frontend.py
├─ tests/test_engine_reference.py
├─ notebooks/anthropometric_squat_coach_realtime.ipynb   exploration + the original Colab prototype
└─ requirements.txt
```

## Setup
```bash
cd ml
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## Export the model to the website
```bash
python scripts/export_for_frontend.py               # writes frontend/src/engine/generated/*
python scripts/export_for_frontend.py --csv my_labelled_reps.csv   # train on real, coach-labelled reps
```
(or `cd ../frontend && npm run sync:ml`)

## Tests
```bash
pytest tests            # or: python tests/test_engine_reference.py
```

The notebook stays useful for exploration (fairness audit plots, sensitivity analysis); `formfit_ml` is the version the
website is built from.
