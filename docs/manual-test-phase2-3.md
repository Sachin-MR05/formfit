# Manual test checklist: Live Coach (Phase 2) and Voice (Phase 3)

The automated tests cover the logic with simulated poses. These checks need a real camera, real videos and real
voices, so please run them once on your machine and tell me what you see.

## 0. Setup
```bash
cd frontend
npm install
npm run setup:models      # MediaPipe WASM + pose models into public/models
npm run dev               # http://localhost:5173
```
Open **/design** first: the *Environment check* tile must be all green (camera API, WebAssembly, WebGL2, model files).

## 1. Step 1: personalize (this is what fills "Your build" and the dashed target torso)
Take a standing photo of the person:
- **side-on** to the camera, whole body in frame **including the feet**, camera about hip height, 2 to 3 m away
- relaxed upright stance, **legs straight**, arms by the sides, plain background, decent light
- JPG/PNG (iPhone HEIC must be converted)

Upload it in **Step 1**. Expected:
- [ ] The photo appears with the skeleton drawn on it and a **dashed cyan "Target N°" line** from the hip
- [ ] Step 1 says "Personalized from ... (N clean standing frames)"
- [ ] **Your build** shows three ratios and "Your balanced torso lean at parallel  A° – B°"
- [ ] Reload the page: the profile is restored ("Using your saved profile")

If it fails, open **"What the app saw in each frame"**: it lists the measured knee angle / torso lean / visibility for
each frame and what to fix. The fallbacks under **"Calibration not working?"** (average build, typed-in ratios) let you
test everything else regardless. Please send me that list if a good photo is rejected.

## 2. Live Coach (/coach)
- [ ] Start live camera, allow permission; skeleton follows you; fps chip shows
- [ ] Squat: segments turn green/amber/red, the dashed target torso is visible **while standing too** (subtle) and bold during a rep
- [ ] After each rep: score, band, cue headline, rep list entry, rep strip circle, tempo (down/up seconds)
- [ ] Depth tile reaches 100% only when the hips go to knee level or lower
- [ ] Pause / Resume, Finish set (summary appears), Discard set
- [ ] A slow device shows "Tracking at N fps. Switch to the lite pose model" with a button

## 3. Video Review (/review)
- [ ] Upload a side-on MP4/WebM of squats; it plays with the skeleton and live features panel
- [ ] Pause, scrub (seek bar), speed 0.25x to 1.5x; scrubbing mid-rep does not create bogus reps
- [ ] No photo? "Use the next 3 s of this video" while the person is standing calibrates from the video
- [ ] At the end: banner "Video finished: N reps, average score X"; the session appears in **/history**

## 4. Voice (Settings, or the speaker button on the video)
- [ ] Press the speaker button: "Voice coaching on." is spoken (this click unlocks speech in the browser)
- [ ] Do a rep with a fault: one line like "One. Chest up." after the rep, not during it
- [ ] The same fault is not announced on every rep; clean reps get the count and an occasional "Clean rep."
- [ ] Knees travelling far forward is announced **during** the descent (once per rep)
- [ ] Voice OFF: captions still appear on the video (silent mode); "Vibrate on corrections" works on a phone
- [ ] Settings: style (calm / motivating / count only), volume, speed, voice list, Test voice
- [ ] Finish set: "Set complete. N reps, average X."

## 5. Saving
- [ ] **/history** lists sessions with rep counts and averages; Delete works
- [ ] Mark reps Good/Faulty (Coach label), then **Download CSV** on History; the file feeds
      `python ml/scripts/export_for_frontend.py --csv file.csv`

## Known limitations
- Needs a **side-on** camera view with the whole body visible; front views cannot judge depth or torso lean.
- The model is trained on **simulated** people until you collect coach-labelled reps.
- Speech voices depend on the browser and operating system (Chrome and Edge have the most; some Linux setups have none).
- English phrases only for now.
- Not yet verified by me on a real camera or in a real browser: please report anything odd.
