/**
 * CoachRuntime: wires the pose detector, the camera / uploaded video, the SessionController, drawing,
 * local saving and the shared store together. All browser services are injected (see RuntimeDeps), so the
 * whole loop can be exercised in tests with a fake detector and a fake video element.
 */
import { coach as coachFor, type Engine, type EngineConfig } from '../../engine/index.ts';
import { drawStill, drawTrack } from '../pose/draw.ts';
import type { PoseDetector } from '../pose/detector.ts';
import type { PoseVariant } from '../pose/assets.ts';
import type { StillFrame } from '../pose/media.ts';
import { SessionController, calibrateFromStills, summarizeNotes, trackFromStill } from './controller.ts';
import type { RuntimeEvent, RuntimeListener } from './events.ts';
import { makeProfileView } from './profileView.ts';
import { newId, type SessionRepository } from './repository.ts';
import { createCoachStore, type CoachState, type CoachStore, type RepView, type SourceKind, type Tone } from './store.ts';
import type { CalibrationOutcome, CompletedRep, FrameResult, RepLabel, StoredProfile, StoredRep, StoredSession } from './types.ts';

export interface RuntimeDeps {
  engine: Engine;
  repo: SessionRepository;
  createDetector(variant: PoseVariant): Promise<PoseDetector>;
  framesFromFile(file: File, cfg: EngineConfig): Promise<StillFrame[]>;
  openCamera(): Promise<MediaStream>;
  createObjectUrl(blob: Blob): string;
  revokeObjectUrl(url: string): void;
  /** milliseconds, monotonic */
  now(): number;
  requestFrame(cb: () => void): number;
  cancelFrame(id: number): void;
}

/** Publish live metrics to the store at most this often (ms). */
const PUBLISH_EVERY_MS = 100;

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export class CoachRuntime {
  readonly store: CoachStore;
  private readonly controller: SessionController;

  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;

  private detector: PoseDetector | null = null;
  private detectorVariant: PoseVariant | null = null;

  private source: SourceKind = 'none';
  private fileName: string | null = null;
  private fileUrl: string | null = null;
  private stream: MediaStream | null = null;

  private running = false;
  private cameraPaused = false;
  private busy = false;
  private frameHandle: number | null = null;
  private lastVideoT = -1;

  private lastStatus: FrameResult['status'] | null = null;
  private lastPublishMs = 0;
  private fpsWindowStart = 0;
  private fpsFrames = 0;

  private lowFpsWindows = 0;
  private listeners = new Set<RuntimeListener>();

  private session: StoredSession | null = null;
  private repViews: RepView[] = [];
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly deps: RuntimeDeps) {
    this.store = createCoachStore();
    this.controller = new SessionController(deps.engine);
  }

  // ----------------------------------------------------------------------------- lifecycle
  attach(video: HTMLVideoElement, canvas: HTMLCanvasElement): void {
    this.video = video;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    video.onended = () => this.onVideoEnded();
    video.onplay = () => this.syncVideoState();
    video.onpause = () => this.syncVideoState();
  }

  /** Called when the video stage unmounts (route change): stops the source but keeps the loaded pose model. */
  release(): void {
    if (this.source !== 'none') this.stop();
    this.video = null;
    this.canvas = null;
    this.ctx = null;
  }

  /** Full teardown, including the pose model. */
  detach(): void {
    this.release();
    this.detector?.close();
    this.detector = null;
    this.detectorVariant = null;
  }

  get repository(): SessionRepository {
    return this.deps.repo;
  }

  /** Load the saved body profile (so the user does not have to recalibrate every visit). */
  async init(): Promise<void> {
    try {
      const saved = await this.deps.repo.loadProfile();
      if (saved) this.installProfile(saved, `Using your saved profile (${saved.source}, ${new Date(saved.createdAt).toLocaleDateString()}).`, true);
    } catch (e) {
      this.setState({ saveError: `Could not read saved data: ${errMsg(e)}` });
    }
  }

  // ----------------------------------------------------------------------------- store helpers
  private setState(patch: Partial<CoachState>): void {
    this.store.setState(patch);
  }
  private banner(text: string, tone: Tone = 'info'): void {
    this.setState({ banner: { text, tone } });
  }
  /** Run storage work in order; a failure never interrupts coaching. */
  private enqueue(job: () => Promise<void>): void {
    this.queue = this.queue.then(job).catch((e) => this.setState({ saveError: `Saving failed: ${errMsg(e)}` }));
  }
  /** Resolves when all pending saves have finished (tests, and "finish set" before navigating away). */
  flush(): Promise<void> {
    return this.queue;
  }

  /** Listen to runtime events (voice coach, analytics). Returns an unsubscribe function. */
  subscribe(listener: RuntimeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private emit(event: RuntimeEvent): void {
    for (const l of this.listeners) {
      try {
        l(event);
      } catch {
        /* a faulty listener must never break coaching */
      }
    }
  }

  // ----------------------------------------------------------------------------- pose model
  private async getDetector(): Promise<PoseDetector> {
    const wanted = this.store.getState().poseVariant;
    if (this.detector && this.detectorVariant === wanted) return this.detector;
    this.detector?.close();
    this.detector = null;
    this.setState({ modelLoading: true });
    this.banner(`Loading pose model (${wanted})…`);
    try {
      this.detector = await this.deps.createDetector(wanted);
      this.detectorVariant = wanted;
      return this.detector;
    } finally {
      this.setState({ modelLoading: false });
    }
  }

  async setPoseVariant(variant: PoseVariant): Promise<void> {
    this.setState({ poseVariant: variant, perfHint: null });
    this.lowFpsWindows = 0;
    if (this.detector) {
      this.busy = true;
      try {
        await this.getDetector();
        this.banner('Pose model switched.', 'ok');
      } catch (e) {
        this.banner(`Could not load the pose model: ${errMsg(e)}`, 'err');
      } finally {
        this.busy = false;
      }
    }
  }

  // ----------------------------------------------------------------------------- sources
  private stopSource(): void {
    this.running = false;
    if (this.frameHandle !== null) this.deps.cancelFrame(this.frameHandle);
    this.frameHandle = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    const v = this.video;
    if (v) {
      try {
        v.pause();
      } catch {
        /* element may already be detached */
      }
      v.srcObject = null;
      v.removeAttribute('src');
      v.load();
    }
    if (this.fileUrl) this.deps.revokeObjectUrl(this.fileUrl);
    this.fileUrl = null;
  }

  private beginRun(source: SourceKind, fileName: string | null): void {
    this.finishSet();
    this.source = source;
    this.fileName = fileName;
    this.cameraPaused = false;
    this.lastVideoT = -1;
    this.lastStatus = null;
    this.fpsWindowStart = this.deps.now();
    this.fpsFrames = 0;
    this.controller.resetSession();
    this.setState({
      source,
      fileName,
      paused: false,
      live: null,
      video: source === 'file' ? { currentTime: 0, duration: this.video?.duration ?? 0, rate: this.video?.playbackRate ?? 1, ended: false } : null,
    });
    this.running = true;
    this.lowFpsWindows = 0;
    this.setState({ perfHint: null });
    this.frameHandle = this.deps.requestFrame(this.tick);
    this.emit({ type: 'source_started', source });
  }

  async startCamera(): Promise<void> {
    const v = this.video;
    if (!v) return;
    try {
      await this.getDetector();
      this.stopSource();
      const stream = await this.deps.openCamera();
      this.stream = stream;
      v.srcObject = stream;
      await v.play();
    } catch (e) {
      this.banner(`Could not start the camera: ${errMsg(e)}. Allow camera access, or upload a video instead.`, 'err');
      return;
    }
    this.beginRun('camera', null);
    this.banner(
      this.controller.bodyProfile ? 'Tracking. Squat when ready.' : 'Camera ready. Upload a standing photo (Step 1) or calibrate with the camera.',
      this.controller.bodyProfile ? 'ok' : 'warn',
    );
  }

  async loadVideo(file: File): Promise<void> {
    const v = this.video;
    if (!v) return;
    try {
      await this.getDetector();
      this.stopSource();
      const url = this.deps.createObjectUrl(file);
      this.fileUrl = url;
      v.muted = true;
      v.playsInline = true;
      await new Promise<void>((resolve, reject) => {
        v.onloadedmetadata = () => resolve();
        v.onerror = () => reject(new Error('This video format cannot be decoded by your browser (try MP4/H.264 or WebM).'));
        v.src = url;
      });
      v.playbackRate = this.store.getState().video?.rate ?? 1;
      this.beginRun('file', file.name);
      await v.play();
    } catch (e) {
      this.banner(`Could not open the video: ${errMsg(e)}`, 'err');
      return;
    }
    this.banner(
      this.controller.bodyProfile
        ? `Analysing "${file.name}" with your personalization…`
        : `Analysing "${file.name}". Not personalized yet: upload a standing photo, or press "Use the next 3 s of this video" while the person stands.`,
      this.controller.bodyProfile ? 'ok' : 'warn',
    );
  }

  /** Stop everything and return to the idle state. */
  stop(): void {
    this.stopSource();
    this.finishSet();
    this.source = 'none';
    this.ctx?.clearRect(0, 0, this.canvas?.width ?? 0, this.canvas?.height ?? 0);
    this.setState({ source: 'none', fileName: null, live: null, video: null, paused: false, fps: 0 });
    this.banner('Stopped.');
  }

  // ----------------------------------------------------------------------------- playback controls (video review)
  togglePause(): void {
    const v = this.video;
    if (!v) return;
    if (this.source === 'file') {
      if (v.ended || (v.duration && v.currentTime >= v.duration - 0.05)) {
        this.finishSet();
        this.controller.resetSession();
        v.currentTime = 0;
        void v.play();
        return;
      }
      if (v.paused) void v.play();
      else v.pause();
      this.syncVideoState();
    } else if (this.source === 'camera') {
      this.cameraPaused = !this.cameraPaused;
      this.setState({ paused: this.cameraPaused });
    }
  }

  seek(fraction: number): void {
    const v = this.video;
    if (v && this.source === 'file' && v.duration) v.currentTime = Math.min(1, Math.max(0, fraction)) * v.duration;
  }

  setPlaybackRate(rate: number): void {
    if (this.video) this.video.playbackRate = rate;
    const cur = this.store.getState().video;
    if (cur) this.setState({ video: { ...cur, rate } });
  }

  private syncVideoState(): void {
    const v = this.video;
    if (!v || this.source !== 'file') return;
    this.setState({
      paused: v.paused,
      video: { currentTime: v.currentTime, duration: v.duration || 0, rate: v.playbackRate, ended: v.ended },
    });
  }

  private onVideoEnded(): void {
    if (this.source !== 'file') return;
    const open = this.controller.finishCalibrationNow();
    if (open) this.handleCalibrationOutcome(open);
    const summary = this.finishSet();
    this.syncVideoState();
    this.banner(
      summary ? `Video finished: ${summary.count} rep${summary.count > 1 ? 's' : ''}, average score ${summary.average}, ${summary.good} judged good.` : 'Video finished: no complete squat repetitions were detected.',
      summary ? 'ok' : 'warn',
    );
  }

  // ----------------------------------------------------------------------------- calibration
  startCameraCalibration(): void {
    if (this.source !== 'camera') return;
    this.controller.startCalibration('camera', this.deps.now() / 1000);
    this.setState({ calibration: { status: 'running', message: 'Calibrating from the camera…', progress: null }, profile: null });
  }

  startVideoCalibration(): void {
    const v = this.video;
    if (this.source !== 'file' || !v) return;
    this.controller.startCalibration('video', v.currentTime);
    if (v.paused) void v.play();
    this.setState({ calibration: { status: 'running', message: 'Calibrating from this video…', progress: null }, profile: null });
  }

  /** Personalize from standing photos and/or a short clip (frames are extracted and measured locally). */
  async calibrateFromFiles(files: File[]): Promise<void> {
    if (files.length === 0) return;
    this.busy = true;
    this.setState({ calibration: { status: 'running', message: `Reading ${files.length} file(s)…`, progress: null } });
    this.banner('Extracting frames and measuring body proportions…', 'warn');
    try {
      const detector = await this.getDetector();
      const frames: StillFrame[] = [];
      const skipped: string[] = [];
      for (const f of files) {
        try {
          frames.push(...(await this.deps.framesFromFile(f, this.deps.engine.config)));
        } catch {
          skipped.push(f.name);
        }
      }
      if (frames.length === 0) throw new Error(`None of the files could be read (${skipped.join(', ')}). Use JPG/PNG photos or MP4/WebM clips.`);
      const poses = await detector.detectStills(frames.map((f) => f.canvas));
      const cal = calibrateFromStills(poses.map((frame, i) => ({ frame, aspect: frames[i]!.aspect })));
      const details = cal.notes.slice(0, 12).map((n, i) => `Frame ${i + 1}: ${n}`);
      if (!cal.result) {
        const why = summarizeNotes(cal.notes);
        const msg = `No usable standing frame found${why ? ` (${why})` : ''}. Use a side-on, full-body, standing photo with straight legs and your feet in view.`;
        this.setState({ calibration: { status: 'failed', message: msg, progress: null, details } });
        this.banner(msg, 'err');
        return;
      }
      const stored: StoredProfile = {
        kind: 'measured',
        profile: cal.result.profile,
        side: cal.result.side,
        hipImageY0: cal.result.hipImageY0,
        thigh2d: cal.result.thigh2d,
        samples: cal.result.samples,
        source: `${files.length} file(s), ${frames.length} frame(s) analysed`,
        createdAt: this.deps.now(),
      };
      this.installProfile(stored, `Personalized from ${stored.source} (${stored.samples} clean standing frame${stored.samples > 1 ? 's' : ''}). Now start the camera or upload a squat video.`);
      this.setState({ calibration: { ...this.store.getState().calibration, details } });
      this.persistProfile(stored);
      if (cal.bestIndex !== null && !this.running && this.canvas && this.ctx) {
        const still = frames[cal.bestIndex]!;
        this.canvas.width = still.canvas.width;
        this.canvas.height = still.canvas.height;
        this.setState({ mediaSize: { w: still.canvas.width, h: still.canvas.height } });
        const track = trackFromStill(poses[cal.bestIndex]!);
        const verdict = coachFor(this.deps.engine.config, track.features, stored.profile, 'live');
        drawStill(this.ctx, still.canvas.width, still.canvas.height, still.canvas, track, { coach: verdict, inRep: false });
      }
    } catch (e) {
      const msg = `Personalization failed: ${errMsg(e)}`;
      this.setState({ calibration: { status: 'failed', message: msg, progress: null } });
      this.banner(msg, 'err');
    } finally {
      this.busy = false;
    }
  }

  /**
   * Fallback when calibration is not possible: an average build, clearly labelled as NOT personalized.
   * Not saved, so a later visit never mistakes it for a measured profile.
   */
  useAverageBuild(): void {
    const stored: StoredProfile = {
      kind: 'average',
      profile: { femurTorso: 0.85, shankFemur: 1.0, legTorso: 1.7, upSign: -1 },
      side: 'left',
      hipImageY0: 0,
      thigh2d: 0,
      samples: 0,
      source: 'average build (not personalized)',
      createdAt: this.deps.now(),
    };
    this.installProfile(stored, 'Using an AVERAGE build. Scores are not personalized until you calibrate with a photo or the camera.');
  }

  /** Ratios the user typed in (e.g. measured with a tape). Returns an error message if they are not plausible. */
  setManualProfile(femurTorso: number, shankFemur: number): string | null {
    if (!(femurTorso >= 0.5 && femurTorso <= 1.4)) return 'Femur / torso should be between 0.5 and 1.4 (typical: 0.7 to 1.1).';
    if (!(shankFemur >= 0.7 && shankFemur <= 1.3)) return 'Shank / femur should be between 0.7 and 1.3 (typical: 0.85 to 1.15).';
    const stored: StoredProfile = {
      kind: 'manual',
      profile: { femurTorso, shankFemur, legTorso: femurTorso * (1 + shankFemur), upSign: -1 },
      side: 'left',
      hipImageY0: 0,
      thigh2d: 0,
      samples: 0,
      source: 'ratios you entered',
      createdAt: this.deps.now(),
    };
    this.installProfile(stored, 'Using the ratios you entered.');
    this.persistProfile(stored);
    return null;
  }

  clearProfile(): void {
    this.controller.clearProfile();
    this.setState({ profile: null, calibration: { status: 'none', message: 'Not personalized yet. Upload a standing side-on photo to begin.', progress: null } });
    this.enqueue(() => this.deps.repo.clearProfile());
  }

  private installProfile(stored: StoredProfile, message: string, restored = false): void {
    this.controller.setProfile({
      profile: stored.profile,
      side: stored.side,
      hipImageY0: stored.hipImageY0,
      thigh2d: stored.thigh2d,
      samples: stored.samples,
    });
    this.setState({
      profile: makeProfileView(this.deps.engine, stored),
      calibration: { status: 'ok', message, progress: null },
    });
    this.banner(message, 'ok');
    this.emit({ type: 'profile_ready', kind: stored.kind ?? 'measured', restored });
  }

  private persistProfile(stored: StoredProfile): void {
    this.enqueue(() => this.deps.repo.saveProfile(stored));
  }

  private handleCalibrationOutcome(outcome: CalibrationOutcome): void {
    if (!outcome.ok) {
      this.setState({ calibration: { status: 'failed', message: outcome.reason, progress: null, details: [] } });
      this.banner(outcome.reason, 'err');
      return;
    }
    const p = this.controller.bodyProfile!;
    const meta = this.controller.calibrationMeta;
    const stored: StoredProfile = {
      kind: 'measured',
      profile: p,
      side: this.controller.trackedSide ?? 'left',
      hipImageY0: meta.hipImageY0,
      thigh2d: meta.thigh2d,
      samples: outcome.samples,
      source: outcome.source,
      createdAt: this.deps.now(),
    };
    this.installProfile(stored, `Personalized from ${outcome.source} (${outcome.samples} clean standing frames).`);
    this.persistProfile(stored);
  }

  // ----------------------------------------------------------------------------- the frame loop
  private tick = (): void => {
    if (!this.running) return;
    this.frameHandle = this.deps.requestFrame(this.tick);
    this.step();
  };

  /** Process one video frame if there is a new one. Public so tests can drive the loop deterministically. */
  step(): void {
    const v = this.video;
    const d = this.detector;
    const canvas = this.canvas;
    if (!v || !d || !canvas || this.busy || (this.source === 'camera' && this.cameraPaused)) return;
    if (v.readyState < 2 || v.currentTime === this.lastVideoT) return;
    this.lastVideoT = v.currentTime;
    const w = v.videoWidth;
    const h = v.videoHeight;
    if (!w || !h) return;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      this.setState({ mediaSize: { w, h } });
    }

    const nowMs = this.deps.now();
    let pose;
    try {
      pose = d.detectVideo(v, nowMs);
    } catch {
      return;
    }
    const tSeconds = this.source === 'file' ? v.currentTime : nowMs / 1000;
    const result = this.controller.process(pose, tSeconds, w / h);
    this.onResult(result, w, h, nowMs, tSeconds);
  }

  private onResult(result: FrameResult, w: number, h: number, nowMs: number, tSeconds: number): void {
    const ctx = this.ctx;
    if (ctx) {
      ctx.clearRect(0, 0, w, h);
      if (result.track) drawTrack(ctx, w, h, result.track, { coach: result.coach ?? null, inRep: result.inRep ?? false });
    }

    this.fpsFrames += 1;
    if (nowMs - this.fpsWindowStart >= 1000) {
      const fps = Math.round((this.fpsFrames * 1000) / (nowMs - this.fpsWindowStart));
      this.setState({ fps });
      this.fpsWindowStart = nowMs;
      this.fpsFrames = 0;
      this.updatePerfHint(fps);
    }

    if (result.calibrated) this.handleCalibrationOutcome(result.calibrated);
    if (result.rep) this.handleRep(result.rep);

    if (result.status !== this.lastStatus) {
      this.lastStatus = result.status;
      this.bannerForStatus(result);
    } else if (result.status === 'calibrating' && result.calibration) {
      const c = result.calibration;
      this.banner(
        c.phase === 'warmup' ? `Stand tall, side-on, arms relaxed. Starting in ${c.remainingS.toFixed(1)} s…` : `Hold still… ${c.remainingS.toFixed(1)} s (standing samples: ${c.samples})`,
        'warn',
      );
    }

    if (nowMs - this.lastPublishMs >= PUBLISH_EVERY_MS || result.rep || result.calibrated) {
      this.lastPublishMs = nowMs;
      this.publishLive(result);
    }
    if (result.status === 'tracking' && result.coach) {
      this.emit({ type: 'frame', tSeconds, coach: result.coach, inRep: result.inRep ?? false });
    }
  }

  /** Camera only: a slow device gets a suggestion to use the lite pose model (not forced). */
  private updatePerfHint(fps: number): void {
    if (this.source !== 'camera') return;
    this.lowFpsWindows = fps < 12 ? this.lowFpsWindows + 1 : 0;
    const variant = this.store.getState().poseVariant;
    if (this.lowFpsWindows >= 3 && variant !== 'lite') {
      this.setState({ perfHint: `Tracking at ${fps} fps. Switch to the lite pose model for smoother results.` });
    } else if (fps >= 15 && this.store.getState().perfHint) {
      this.setState({ perfHint: null });
    }
  }

  private bannerForStatus(r: FrameResult): void {
    switch (r.status) {
      case 'no_person':
        this.banner('No person detected. Make sure your whole body is visible.', 'warn');
        break;
      case 'low_visibility':
        this.banner(`Your ${r.track?.side ?? ''} side is not clearly visible. Turn side-on and keep hip, knee and ankle in view.`, 'warn');
        break;
      case 'need_profile':
        this.banner(
          this.source === 'file'
            ? 'Not personalized: upload a standing photo (Step 1) or use the next 3 s of this video as calibration.'
            : 'Not personalized: upload a standing photo (Step 1) or press the camera calibrate button.',
          'warn',
        );
        break;
      case 'tracking':
        this.banner('Tracking. Squat when ready.', 'ok');
        break;
      case 'calibrating':
        break;
    }
  }

  private publishLive(r: FrameResult): void {
    const t = r.track;
    const ids = t
      ? {
          shoulder: [t.landmarks[t.side === 'left' ? 11 : 12]!.x, t.landmarks[t.side === 'left' ? 11 : 12]!.y] as [number, number],
          hip: [t.landmarks[t.side === 'left' ? 23 : 24]!.x, t.landmarks[t.side === 'left' ? 23 : 24]!.y] as [number, number],
          knee: [t.landmarks[t.side === 'left' ? 25 : 26]!.x, t.landmarks[t.side === 'left' ? 25 : 26]!.y] as [number, number],
          ankle: [t.landmarks[t.side === 'left' ? 27 : 28]!.x, t.landmarks[t.side === 'left' ? 27 : 28]!.y] as [number, number],
        }
      : null;
    const patch: Partial<CoachState> = {
      live: {
        status: r.status,
        features: t?.features ?? null,
        coach: r.coach ?? null,
        inRep: r.inRep ?? false,
        depthPct: r.depthPct ?? 0,
        hipDepthRatio: t?.hipDepthRatio ?? null,
        joints: ids,
      },
    };
    if (r.status === 'calibrating' && r.calibration && !r.calibrated) {
      patch.calibration = { status: 'running', message: 'Calibrating…', progress: r.calibration };
    }
    const v = this.video;
    if (this.source === 'file' && v) {
      patch.video = { currentTime: v.currentTime, duration: v.duration || 0, rate: v.playbackRate, ended: v.ended };
    }
    this.setState(patch);
  }

  // ----------------------------------------------------------------------------- reps and sets
  private handleRep(rep: CompletedRep): void {
    const profile = this.controller.bodyProfile;
    if (!profile) return;
    const view: RepView = {
      id: newId(),
      index: this.repViews.length + 1,
      tSeconds: rep.tSeconds,
      score: rep.score.score,
      band: rep.score.band,
      personalized: rep.score.personalized,
      generic: rep.score.generic,
      ruleOk: rep.score.ruleOk,
      ruleReasons: rep.score.ruleReasons,
      codes: rep.coach.codes,
      cues: rep.coach.cues,
      downS: rep.event.downS,
      upS: rep.event.upS,
      features: rep.event.bottom,
      label: null,
    };
    this.repViews = [...this.repViews, view];
    this.setState({ reps: this.repViews, lastRep: view });
    this.emit({ type: 'rep', rep: view });
    const { setSize } = this.store.getState();
    this.banner(
      this.repViews.length === setSize ? `Target reached: ${setSize} reps. Press Finish Set to save.` : `Rep ${view.index} scored: ${view.score}/100`,
      view.score >= this.deps.engine.config.scoreBorderlineMin ? 'ok' : 'warn',
    );

    // persistence (local first)
    const session = this.ensureSession(profile);
    const stored: StoredRep = {
      id: view.id,
      sessionId: session.id,
      index: view.index,
      createdAt: this.deps.now(),
      tSeconds: view.tSeconds,
      features: view.features,
      profile,
      score: view.score,
      personalized: view.personalized,
      generic: view.generic,
      ruleOk: view.ruleOk,
      ruleReasons: view.ruleReasons,
      codes: view.codes,
      downS: view.downS,
      upS: view.upS,
      modelVersion: this.deps.engine.modelVersion,
      label: null,
    };
    this.enqueue(() => this.deps.repo.addRep(stored));
  }

  private ensureSession(profile: StoredSession['profile']): StoredSession {
    if (this.session) return this.session;
    const s: StoredSession = {
      id: newId(),
      startedAt: this.deps.now(),
      endedAt: null,
      source: this.source === 'file' ? 'upload' : 'live',
      fileName: this.fileName,
      poseModel: this.store.getState().poseVariant,
      modelVersion: this.deps.engine.modelVersion,
      profile,
    };
    this.session = s;
    this.enqueue(() => this.deps.repo.createSession(s));
    return s;
  }

  setSetSize(n: number): void {
    this.setState({ setSize: Math.max(1, Math.min(50, Math.round(n))) });
  }

  /** Coach feedback on a rep (used to build a labelled dataset for retraining). */
  labelRep(repId: string, label: RepLabel): void {
    this.repViews = this.repViews.map((r) => (r.id === repId ? { ...r, label } : r));
    const lastRep = this.store.getState().lastRep;
    this.setState({ reps: this.repViews, lastRep: lastRep && lastRep.id === repId ? { ...lastRep, label } : lastRep });
    this.enqueue(() => this.deps.repo.setRepLabel(repId, label));
  }

  /** Save the current set and start a fresh one. Returns the summary, or null if there were no reps. */
  finishSet(): { count: number; average: number; good: number } | null {
    const reps = this.repViews;
    const session = this.session;
    this.session = null;
    this.repViews = [];
    this.controller.resetSession();
    this.setState({ reps: [] });
    if (reps.length === 0) return null;
    const summary = {
      count: reps.length,
      average: Math.round(reps.reduce((a, r) => a + r.score, 0) / reps.length),
      good: reps.filter((r) => r.score >= this.deps.engine.config.scoreBorderlineMin).length,
    };
    this.setState({ lastSet: summary });
    this.emit({ type: 'set_finished', summary });
    if (session) this.enqueue(() => this.deps.repo.updateSession(session.id, { endedAt: this.deps.now() }));
    return summary;
  }

  /** Discard the on-screen set without ending the camera (keeps the body profile). */
  resetSet(): void {
    this.finishSet();
    this.setState({ lastRep: null, lastSet: null });
    this.banner('Set reset. Your body profile is kept.');
  }
}
