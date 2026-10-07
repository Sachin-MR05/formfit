# engine/ — scoring engine

Pure TypeScript: **no React, no DOM**, relative imports only, so it runs in the browser, in Vitest and in Node.

| File | Purpose |
|---|---|
| `types.ts` | shared types (features, body profile, cue codes) |
| `config.ts` | validated view of `generated/config.json` |
| `geometry.ts` | landmarks → joint features, body ratios, **balance model** (personal torso target), planar pose for the ghost skeleton |
| `network.ts` | MLP forward pass + validation of `generated/model.v1.json` |
| `engine.ts` | `createEngine(config, model)`: checks feature order and builds the engine |
| `scoring.ts` | `scoreRep`: personalized score, generic score, fixed-rule verdict |
| `coach.ts` | geometry-aware cues with codes, priority, screen text and short **spoken** text (for Phase 3) |
| `smoothing.ts` | EMA smoother for the five channels |
| `repTracker.ts` | rep state machine with **tempo** (`downS` / `upS`) |
| `calibration.ts` | `CalibrationAccumulator`: standing frames (camera, clip or photos) → body profile |
| `loader.ts` | the default engine from the generated JSON (import this from UI code) |
| `generated/` | **written by Python, do not edit** |

## Using it

```ts
import { engine } from '@/engine/loader.ts';
import { FeatureSmoother, RepTracker, scoreRep, coach } from '@/engine/index.ts';

const smoother = new FeatureSmoother(engine.config.emaAlpha);
const tracker = new RepTracker(engine.config);

// per frame (after featuresFromWorld(...)):
const rep = tracker.update(timeSeconds, smoother.update(rawFeatures));
if (rep) {
  const score = scoreRep(engine, rep.bottom, profile);   // score.score 0-100, score.band
  const verdict = coach(engine.config, rep.bottom, profile, 'rep'); // verdict.cues[0].spoken
}
```

## Tests
`*.parity.test.ts` compare this engine with the Python reference using `generated/fixtures.json`
(geometry, ratios, balance model, both networks, scores, cue codes, smoothing and six full rep scenarios).
`calibration.test.ts` is self-contained. Run `npm test`.
