# features/

| Folder | What it does | Tested without a browser? |
|---|---|---|
| `pose/` | landmarks and geometry helpers, drawing, MediaPipe wrapper (`detector.ts`), camera / file helpers (`media.ts`) | helpers and drawing: yes; MediaPipe and camera: no |
| `session/` | `SessionController` (frames to calibration, feedback, reps), `CoachRuntime` (orchestration), repository (IndexedDB), store | yes, with a fake detector, fake video and in-memory repository |
| `voice/` | cue scheduler, phrases, speech output, voice store, VoiceCoach | yes, with a fake speech engine |

`session/test-harness.ts` holds the fakes shared by the tests. Production code reaches everything through
`session/defaultRuntime.ts` (`getRuntime()`, `getVoice()`, `useCoach()`, `useVoice()`).
