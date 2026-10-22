# FormFit

Squat coaching that judges form against **your own body proportions**, not a one-size-fits-all rule.

```
formfit/
├─ frontend/   React + Vite + TypeScript  (all live pose tracking + scoring runs in the browser)
├─ backend/    FastAPI + PostgreSQL        (Phase 4: accounts, sessions, reps, history)
├─ ml/         Python notebooks            (simulator, training, fairness audit, model export)
└─ docs/
```

## Status

| Phase | What | State |
|---|---|---|
| 0 | Project setup | done |
| 1 | Scoring engine in TypeScript + Python integration + parity tests | done |
| **2** | **Live Coach prototype (live camera + uploaded video, saving, history)** | **done, please run the manual checklist** |
| **3** | **Voice coaching (cues, captions, settings)** | **done, please run the manual checklist** |
| 4 | Database + backend + sync | next |
| 5 | Remaining pages | |

## Prerequisites
- **Node.js 20.19+** (or 22.12+). Check with `node --version`.
- Chrome, Edge, Safari or Firefox (current). Camera works on `http://localhost` without HTTPS.
- Python 3.11+ is needed only to re-train/export the model (`npm run sync:ml`) and for the backend later. The generated model files are committed, so the frontend runs without Python.

## Run the frontend

```bash
cd frontend
npm install
npm run setup:models      # copies MediaPipe WASM + downloads pose models into public/models
npm run dev               # open http://localhost:5173
```

Add `-- --heavy` to `setup:models` for the most accurate (larger) pose model.

| Script | Purpose |
|---|---|
| `npm run dev` | dev server with hot reload |
| `npm run build` | type-check + production build |
| `npm run typecheck` | TypeScript only |
| `npm run lint` | ESLint |
| `npm run format` / `format:check` | Prettier |
| `npm test` / `npm run test:watch` | Vitest |
| `npm run setup:models` | fetch pose models + WASM |

## Phase 1: Python ↔ frontend

```bash
cd ml && pip install -r requirements.txt
cd ../frontend && npm run sync:ml     # train in Python, export model + config + fixtures
npm test                              # the TypeScript engine must reproduce the Python results
```

See `docs/architecture.md`. The design page now includes an **Engine playground** that runs the exported model.

## Phase 0 + 1 checks
- [ ] `npm run dev` shows the **FormFit design page** with the Unbounded headline font, Inter body text and the pastel colour tokens.
- [ ] Dragging the **score slider** changes the ring, label and coach cue (proves Zustand + Framer Motion).
- [ ] The **Environment check** tile at the bottom is all green (needs `npm run setup:models`).
- [ ] `npm test`, `npm run lint` and `npm run typecheck` pass (run `npm run format` once first).
- [ ] Moving the **Engine playground** sliders changes the target torso, the scores and the fixed-rule verdict.

## Design rules (see `frontend/src/index.css`)
Colour meaning is fixed everywhere: **lime = good**, **yellow = borderline**, **coral = needs fix**, **sky = your personal target**, **lavender = your proportions**. Colour is always paired with an icon and a word.

## Privacy principle
Pose detection runs on the user's device. Video is never uploaded; only numbers (angles, scores) are saved.

## Try it
Run the app, then follow `docs/manual-test-phase2-3.md` (personalize from a standing photo, squat on the camera, review a video, turn on the voice).

## Next: Phase 4
FastAPI + PostgreSQL: accounts, syncing the locally saved sessions, history across devices.
