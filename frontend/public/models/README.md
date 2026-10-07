# Pose models (not committed)

This folder is filled by `npm run setup:models`:

```
public/models/
├─ wasm/                          MediaPipe WebAssembly runtime (copied from node_modules)
├─ pose_landmarker_lite.task      fastest
├─ pose_landmarker_full.task      balanced (default)
└─ pose_landmarker_heavy.task     most accurate  (only with `--heavy`)
```

Everything is served from your own origin, so the app never depends on a third-party CDN at runtime.
