import type { PulseGridSession, PulseGridTrack } from './pulsegrid-session.js';

export type PulseGridAudioTimingMode = 'cold' | 'worklet' | 'fallback';

export type PulseGridAudioStatus = {
  playing: boolean;
  scene: number;
  step: number;
  context_state: AudioContextState | 'cold';
  timing_mode: PulseGridAudioTimingMode;
  track_bus_count: number;
  active_source_count: number;
  scheduled_steps: number;
  late_schedule_count: number;
  last_schedule_ahead_ms: number | null;
  clock_error: string | null;
};

type PulseGridTrackBus = {
  input: GainNode;
  filter: BiquadFilterNode;
  dry: GainNode;
  delay: DelayNode;
  feedback: GainNode;
  wet: GainNode;
};

export class PulseGridAudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private clock: AudioWorkletNode | null = null;
  private clockSink: GainNode | null = null;
  private fallbackTimer: ReturnType<typeof setInterval> | null = null;
  private readonly uiTimers = new Set<ReturnType<typeof setTimeout>>();
  private readonly trackBuses = new Map<string, PulseGridTrackBus>();
  private readonly activeSources = new Set<AudioScheduledSourceNode>();
  private session: PulseGridSession | null = null;
  private scene = 0;
  private step = 0;
  private nextTime = 0;
  private noiseBuffer: AudioBuffer | null = null;
  private playing = false;
  private timingMode: PulseGridAudioTimingMode = 'cold';
  private workletUnavailable = false;
  private clockError: string | null = null;
  private scheduledSteps = 0;
  private lateScheduleCount = 0;
  private lastScheduleAheadMs: number | null = null;
  private readonly lookaheadMs = 25;
  private readonly scheduleAheadSeconds = 0.12;

  onStep: ((step: number) => void) | null = null;

  get status(): PulseGridAudioStatus {
    return {
      playing: this.playing,
      scene: this.scene,
      step: this.step,
      context_state: this.context?.state || 'cold',
      timing_mode: this.timingMode,
      track_bus_count: this.trackBuses.size,
      active_source_count: this.activeSources.size,
      scheduled_steps: this.scheduledSteps,
      late_schedule_count: this.lateScheduleCount,
      last_schedule_ahead_ms: this.lastScheduleAheadMs,
      clock_error: this.clockError,
    };
  }

  updateSession(session: PulseGridSession) {
    this.session = structuredClone(session);
    this.scene = Math.max(0, Math.min(this.scene, Math.max(0, session.tracks[0]?.clips.length - 1 || 0)));
    if (this.context && this.master) this.syncTrackBuses();
    if (this.playing && this.clock) {
      this.clock.port.postMessage({
        type: 'config',
        bpm: this.session.transport.bpm,
        swing: this.session.transport.swing,
        steps: this.loopSteps(),
        lookaheadSec: this.scheduleAheadSeconds,
      });
    }
  }

  setScene(scene: number) {
    const maxScene = Math.max(0, (this.session?.tracks[0]?.clips.length || 1) - 1);
    this.scene = Math.max(0, Math.min(Math.round(scene), maxScene));
    this.step = 0;
    if (!this.context) return;

    const startTime = this.context.currentTime + 0.05;
    if (this.playing) this.stopScheduledSources();
    if (this.playing && this.clock) {
      this.clock.port.postMessage({ type: 'reset', startTime });
    } else {
      this.nextTime = startTime;
    }
  }

  async play(session: PulseGridSession, scene = session.active_scene) {
    this.updateSession(session);
    this.setScene(scene);

    const context = await this.ensureContext();
    if (context.state === 'suspended') await context.resume();
    if (this.playing) return;

    this.syncTrackBuses();
    const workletReady = await this.ensureClockWorklet();
    const startTime = context.currentTime + 0.06;
    this.playing = true;

    if (workletReady && this.clock) {
      this.timingMode = 'worklet';
      this.clock.port.postMessage({
        type: 'start',
        bpm: this.session?.transport.bpm || 120,
        swing: this.session?.transport.swing || 0,
        steps: this.loopSteps(),
        lookaheadSec: this.scheduleAheadSeconds,
        startTime,
      });
    } else {
      this.startFallbackClock(startTime);
    }
  }

  stop() {
    this.playing = false;

    if (this.fallbackTimer) clearInterval(this.fallbackTimer);
    this.fallbackTimer = null;

    if (this.clock) this.clock.port.postMessage({ type: 'stop' });

    for (const timer of this.uiTimers) clearTimeout(timer);
    this.uiTimers.clear();

    this.stopScheduledSources();
    this.disposeAllTrackBuses();

    this.step = 0;
    this.onStep?.(0);
  }

  async close() {
    this.stop();

    if (this.clock) {
      this.clock.port.onmessage = null;
      this.clock.disconnect();
    }
    this.clock = null;

    if (this.clockSink) this.clockSink.disconnect();
    this.clockSink = null;

    if (this.master) this.master.disconnect();

    if (this.context && this.context.state !== 'closed') await this.context.close();

    this.context = null;
    this.master = null;
    this.noiseBuffer = null;
    this.timingMode = 'cold';
    this.workletUnavailable = false;
    this.clockError = null;
  }

  private async ensureContext() {
    if (this.context && this.master) return this.context;
    const Context = globalThis.AudioContext;
    if (!Context) throw new Error('Web Audio is unavailable in this browser.');

    this.context = new Context({ latencyHint: 'interactive' });
    this.master = this.context.createGain();
    this.master.gain.value = 0.72;
    this.master.connect(this.context.destination);
    return this.context;
  }

  private async ensureClockWorklet() {
    const context = this.context;
    if (!context || this.workletUnavailable) return false;
    if (this.clock) return true;

    if (!context.audioWorklet || typeof AudioWorkletNode === 'undefined') {
      this.workletUnavailable = true;
      this.clockError = 'AudioWorklet is unavailable; using main-thread fallback timing.';
      return false;
    }

    try {
      await context.audioWorklet.addModule(new URL('./pulsegrid-clock-worklet.js', import.meta.url));

      this.clock = new AudioWorkletNode(context, 'pulsegrid-clock', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });

      this.clockSink = context.createGain();
      this.clockSink.gain.value = 0;
      this.clock.connect(this.clockSink).connect(context.destination);

      this.clock.port.onmessage = (event) => {
        const message = event.data || {};
        if (message.type !== 'schedule' || !this.playing) return;
        const scheduledStep = Number(message.step);
        const scheduledTime = Number(message.time);
        if (!Number.isFinite(scheduledStep) || !Number.isFinite(scheduledTime)) return;
        this.scheduleTick(Math.max(0, Math.floor(scheduledStep)), scheduledTime);
      };

      this.clockError = null;
      return true;
    } catch (error) {
      this.workletUnavailable = true;
      this.clockError = error instanceof Error
        ? 'AudioWorklet failed; using fallback timing: ' + error.message
        : 'AudioWorklet failed; using main-thread fallback timing.';
      this.clock?.disconnect();
      this.clock = null;
      this.clockSink?.disconnect();
      this.clockSink = null;
      return false;
    }
  }

  private startFallbackClock(startTime: number) {
    if (!this.context) return;

    this.timingMode = 'fallback';
    this.nextTime = startTime;
    this.fallbackTimer = setInterval(() => this.fallbackScheduler(), this.lookaheadMs);
    this.fallbackScheduler();
  }

  private fallbackScheduler() {
    const context = this.context;
    if (!context || !this.session || !this.playing || !this.fallbackTimer) return;

    while (this.nextTime < context.currentTime + this.scheduleAheadSeconds) {
      const scheduledStep = this.step;
      const scheduledTime = this.nextTime;
      this.scheduleTick(scheduledStep, scheduledTime);
      this.nextTime += this.stepDuration(this.step);
      this.step = (this.step + 1) % this.loopSteps();
    }
  }

  private scheduleTick(globalStep: number, time: number) {
    const context = this.context;
    if (!context || !this.session || !this.playing) return;

    const aheadMs = (time - context.currentTime) * 1000;
    this.lastScheduleAheadMs = aheadMs;
    this.scheduledSteps += 1;
    if (aheadMs < 0) this.lateScheduleCount += 1;

    const scheduledStep = globalStep % this.loopSteps();
    this.step = scheduledStep;
    this.scheduleStep(scheduledStep, time);

    const delayMs = Math.max(0, aheadMs);
    const timer = globalThis.setTimeout(() => {
      this.uiTimers.delete(timer);
      if (this.playing) this.onStep?.(scheduledStep);
    }, delayMs);
    this.uiTimers.add(timer);
  }

  private loopSteps() {
    if (!this.session) return 16;
    return Math.max(
      1,
      ...this.session.tracks.map((track) => track.clips[this.scene]?.steps.length || 1),
    );
  }

  private stepDuration(step: number) {
    const bpm = this.session?.transport.bpm || 120;
    const swing = this.session?.transport.swing || 0;
    const base = 60 / bpm / 4;
    const amount = (swing / 100) * 0.45;
    return base * (step % 2 === 0 ? 1 + amount : 1 - amount);
  }

  private syncTrackBuses() {
    if (!this.context || !this.master || !this.session) return;

    const liveTrackIds = new Set(this.session.tracks.map((track) => track.id));
    for (const [trackId, bus] of this.trackBuses) {
      if (!liveTrackIds.has(trackId)) {
        this.disposeTrackBus(bus);
        this.trackBuses.delete(trackId);
      }
    }

    for (const track of this.session.tracks) {
      const bus = this.ensureTrackBus(track);
      this.applyTrackBusParameters(bus, track, 1, 1, this.context.currentTime);
    }
  }

  private ensureTrackBus(track: PulseGridTrack) {
    const existing = this.trackBuses.get(track.id);
    if (existing) return existing;

    const context = this.context!;
    const input = context.createGain();
    const filter = context.createBiquadFilter();
    const dry = context.createGain();
    const delay = context.createDelay(1);
    const feedback = context.createGain();
    const wet = context.createGain();

    filter.type = 'lowpass';
    filter.Q.value = 0.6;
    dry.gain.value = 1;

    input.connect(filter);
    filter.connect(dry).connect(this.master!);
    filter.connect(delay);
    delay.connect(feedback).connect(delay);
    delay.connect(wet).connect(this.master!);

    const bus = { input, filter, dry, delay, feedback, wet };
    this.trackBuses.set(track.id, bus);
    return bus;
  }

  private applyTrackBusParameters(
    bus: PulseGridTrackBus,
    track: PulseGridTrack,
    autoVolume: number,
    autoFilter: number,
    time: number,
  ) {
    bus.input.gain.setValueAtTime(Math.max(0, track.volume * autoVolume), time);
    bus.filter.frequency.setValueAtTime(
      Math.max(80, Math.min(19000, track.filterHz * Math.max(0.08, autoFilter))),
      time,
    );
    bus.delay.delayTime.setValueAtTime(Math.max(0.02, Math.min(0.8, track.delayTime)), time);
    bus.feedback.gain.setValueAtTime(Math.max(0, Math.min(0.78, track.delayFeedback)), time);
    bus.wet.gain.setValueAtTime(Math.max(0, Math.min(0.65, track.delayMix)), time);
  }

  private scheduleStep(globalStep: number, time: number) {
    if (!this.context || !this.master || !this.session) return;
    const anySolo = this.session.tracks.some((track) => track.solo);

    for (const track of this.session.tracks) {
      if (track.muted || (anySolo && !track.solo)) continue;
      const clip = track.clips[this.scene];
      if (!clip) continue;

      const step = globalStep % clip.steps.length;
      const probability = clip.probabilities[step] ?? 1;
      const microtime = (clip.microtiming[step] ?? 0) / 1000;
      const autoVolume = clip.automation.volume[step] ?? 1;
      const autoFilter = clip.automation.filter[step] ?? 1;
      const bus = this.ensureTrackBus(track);
      this.applyTrackBusParameters(bus, track, autoVolume, autoFilter, time);

      const velocity = clip.steps[step] || 0;

      if (track.type === 'drums') {
        if (velocity > 0 && Math.random() <= probability) {
          if (step % 4 === 0 || velocity > 0.85) this.kick(bus.input, time + microtime, velocity);
          if (step % 2 === 0 || step % 4 === 3) {
            this.hat(bus.input, time + microtime + 0.004, Math.max(0.12, velocity * 0.34));
          }
        }
        continue;
      }

      if (track.type === 'audio') {
        // Canonical audio-asset storage is intentionally not represented by the graph yet.
        continue;
      }

      const noteEvents = clip.notes.filter((note) => Math.round(note.start) === step);
      for (const note of noteEvents) {
        if (Math.random() > (note.probability ?? 1)) continue;
        this.note(
          bus.input,
          track,
          note.pitch,
          time + (note.microtiming || 0) / 1000,
          this.stepDuration(step) * Math.max(0.01, note.length),
          note.velocity,
        );
      }

      if (!noteEvents.length && velocity > 0 && Math.random() <= probability) {
        const pitch = track.id === 'bass' ? 36 : track.id === 'bell' ? 72 : 60;
        this.note(bus.input, track, pitch, time + microtime, this.stepDuration(step) * 0.85, velocity);
      }
    }
  }

  private kick(destination: AudioNode, time: number, velocity: number) {
    const context = this.context!;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(135, time);
    oscillator.frequency.exponentialRampToValueAtTime(46, time + 0.12);
    gain.gain.setValueAtTime(Math.max(0.001, 0.7 * velocity), time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);

    oscillator.connect(gain).connect(destination);
    this.trackScheduledSource(oscillator, [gain]);
    oscillator.start(time);
    oscillator.stop(time + 0.24);
  }

  private hat(destination: AudioNode, time: number, velocity: number) {
    const context = this.context!;
    if (!this.noiseBuffer) {
      const buffer = context.createBuffer(1, Math.round(context.sampleRate * 0.09), context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
      this.noiseBuffer = buffer;
    }

    const source = context.createBufferSource();
    const highpass = context.createBiquadFilter();
    const gain = context.createGain();

    source.buffer = this.noiseBuffer;
    highpass.type = 'highpass';
    highpass.frequency.value = 6200;
    gain.gain.setValueAtTime(Math.max(0.001, 0.18 * velocity), time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.055);

    source.connect(highpass).connect(gain).connect(destination);
    this.trackScheduledSource(source, [highpass, gain]);
    source.start(time);
    source.stop(time + 0.065);
  }

  private note(
    destination: AudioNode,
    track: PulseGridTrack,
    pitch: number,
    time: number,
    duration: number,
    velocity: number,
  ) {
    const context = this.context!;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = track.id === 'bass' ? 'sawtooth' : track.id === 'bell' ? 'sine' : 'triangle';
    oscillator.frequency.value = 440 * Math.pow(2, (pitch - 69) / 12);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.005, velocity * 0.18), time + 0.008);
    gain.gain.setTargetAtTime(0.0001, time + Math.max(0.03, duration - 0.06), 0.03);

    oscillator.connect(gain).connect(destination);
    this.trackScheduledSource(oscillator, [gain]);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.12);
  }

  private trackScheduledSource(source: AudioScheduledSourceNode, cleanupNodes: AudioNode[]) {
    this.activeSources.add(source);
    source.onended = () => {
      this.activeSources.delete(source);
      try { source.disconnect(); } catch {}
      for (const node of cleanupNodes) {
        try { node.disconnect(); } catch {}
      }
    };
  }

  private stopScheduledSources() {
    for (const source of this.activeSources) {
      try { source.stop(); } catch {}
      try { source.disconnect(); } catch {}
    }
    this.activeSources.clear();
  }

  private disposeTrackBus(bus: PulseGridTrackBus) {
    for (const node of [bus.input, bus.filter, bus.dry, bus.delay, bus.feedback, bus.wet]) {
      try { node.disconnect(); } catch {}
    }
  }

  private disposeAllTrackBuses() {
    for (const bus of this.trackBuses.values()) this.disposeTrackBus(bus);
    this.trackBuses.clear();
  }
}
