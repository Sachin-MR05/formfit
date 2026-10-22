# Voice coaching design

**Principle:** the coach never talks over the movement. It is a short, useful line at the right moment.

| Moment | What is said | Rules |
|---|---|---|
| Descent | only an urgent **safety** cue (knees travelling far forward) | once per rep, at least 8 s apart, interrupts anything else |
| After the rep | the count + at most **one** correction, in one sentence ("Seven. Chest up.") | most urgent first: safety, depth, balance |
| Repeated fault | not repeated every rep (cooldown of 2 reps; safety 1 rep); wording rotates | the on-screen text is always shown |
| Clean rep | the count; an occasional "Clean rep." (about every third) | never constant praise |
| Set finished | "Set complete. 8 reps, average 84." | |
| New calibration | "Calibrated. Start when you are ready." | not spoken for a profile restored from storage |

**Styles:** calm, motivating, count only. **Silent mode:** voice OFF keeps captions (and optional vibration), so feedback
never depends on sound.

## Code map
- `features/voice/scheduler.ts`: pure rules (what to say, when). No speech, no DOM.
- `features/voice/phrases.ts`: the words, per style.
- `features/voice/speech.ts`: browser speech synthesis behind a small interface (`SpeechOutput`), with a no-op fallback.
- `features/voice/voiceCoach.ts`: listens to runtime events; delivers captions, speech and vibration.
- `features/voice/voiceStore.ts`: settings (validated, saved in `localStorage`) and the current caption.
- Browser constraints handled: speech must be unlocked by a click; the voice list loads late; a new line replaces one
  still being spoken (no backlog); Chrome drops a `speak()` right after `cancel()`, so it is deferred slightly.

## Adding a language
Add a phrase bank next to `phrases.ts` (same shape), choose it from the browser language, and add a voice-language
check in Settings. The scheduler needs no change.
