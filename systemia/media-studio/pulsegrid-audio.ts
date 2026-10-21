import {
  PULSEGRID_ARRANGEMENT_BARS,
  PULSEGRID_STEPS_PER_BAR,
  type PulseGridAudioAsset,
  type PulseGridSession,
  type PulseGridTrack,
} from './pulsegrid-session.js';

export type PulseGridClockMode = 'cold' | 'worklet' | 'fallback';
export type PulseGridPlaybackMode = 'scene' | 'arrangement';
export type PulseGridAudioAssetResolver = (asset:PulseGridAudioAsset)=>Promise<Blob|null>;

export type PulseGridAudioStatus = {
  playing: boolean;
  scene: number;
  step: number;
  context_state: AudioContextState | 'cold';
  clock_mode: PulseGridClockMode;
  track_buses: number;
  latency_ms: number | null;
  cached_audio_assets: number;
  playback_mode: PulseGridPlaybackMode;
  arrangement_bar: number | null;
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
  private fallbackTimer: ReturnType<typeof setInterval> | null = null;
  private clockNode: AudioWorkletNode | null = null;
  private clockSink: GainNode | null = null;
  private clockMode: PulseGridClockMode = 'cold';
  private playbackMode: PulseGridPlaybackMode = 'scene';
  private session: PulseGridSession | null = null;
  private scene = 0;
  private step = 0;
  private nextTime = 0;
  private playing = false;
  private noiseBuffer: AudioBuffer | null = null;
  private assetResolver: PulseGridAudioAssetResolver | null = null;
  private readonly audioBuffers = new Map<string, AudioBuffer>();
  private readonly pendingAssetLoads = new Map<string, Promise<void>>();
  private readonly activeSources = new Set<AudioScheduledSourceNode>();
  private readonly trackBuses = new Map<string, PulseGridTrackBus>();
  private readonly lookaheadMs = 25;
  private readonly scheduleAheadSeconds = 0.12;

  onStep: ((step: number) => void) | null = null;
  onStatus: ((status: PulseGridAudioStatus) => void) | null = null;

  get status(): PulseGridAudioStatus {
    const context = this.context as (AudioContext & { outputLatency?: number }) | null;
    const latencySeconds = context
      ? Math.max(0, context.baseLatency || 0) + Math.max(0, context.outputLatency || 0)
      : 0;
    return {
      playing: this.playing,
      scene: this.scene,
      step: this.step,
      context_state: context?.state || 'cold',
      clock_mode: this.clockMode,
      track_buses: this.trackBuses.size,
      latency_ms: context ? Math.round(latencySeconds * 1000) : null,
      cached_audio_assets: this.audioBuffers.size,
      playback_mode: this.playbackMode,
      arrangement_bar: this.playbackMode === 'arrangement'
        ? Math.floor(this.step / PULSEGRID_STEPS_PER_BAR) % PULSEGRID_ARRANGEMENT_BARS
        : null,
    };
  }

  setAudioAssetResolver(resolver:PulseGridAudioAssetResolver|null){
    if(this.assetResolver===resolver)return;
    this.assetResolver=resolver;
    this.audioBuffers.clear();
    this.pendingAssetLoads.clear();
    if(this.context&&this.session&&resolver){
      void this.prepareAudioAssets();
    }
    this.emitStatus();
  }

  updateSession(session: PulseGridSession) {
    this.session = structuredClone(session);
    this.scene = Math.max(
      0,
      Math.min(this.scene, Math.max(0, session.tracks[0]?.clips.length - 1 || 0)),
    );
    if (this.context) {
      this.ensureTrackBuses();
      this.syncAllTrackBuses(this.context.currentTime);
      this.configureClock();
      void this.prepareAudioAssets();
    }
    this.emitStatus();
  }

  setScene(scene: number) {
    const maxScene = Math.max(0, (this.session?.tracks[0]?.clips.length || 1) - 1);
    this.scene = Math.max(0, Math.min(Math.round(scene), maxScene));
    if (this.playing && this.playbackMode === 'arrangement') {
      this.emitStatus();
      return;
    }
    this.step = 0;
    if (this.context) {
      this.nextTime = this.context.currentTime + 0.05;
      this.configureClock();
      if (this.playing && this.clockMode === 'worklet' && this.clockNode) {
        this.clockNode.port.postMessage({
          type: 'reset',
          startTime: this.context.currentTime + 0.05,
        });
      }
    }
    this.onStep?.(0);
    this.emitStatus();
  }

  async play(session: PulseGridSession, scene = session.active_scene) {
    this.playbackMode = 'scene';
    this.updateSession(session);
    this.setScene(scene);
    const context = await this.ensureContext();
    if (context.state === 'suspended') await context.resume();
    await this.prepareAudioAssets();
    if (this.playing) return;

    this.playing = true;
    this.step = 0;
    const workletReady = await this.ensureWorkletClock();

    if (!this.playing) return;
    if (workletReady && this.clockNode) {
      this.clockMode = 'worklet';
      this.clockNode.port.postMessage({
        type: 'start',
        bpm: this.session?.transport.bpm || 120,
        swing: this.session?.transport.swing || 0,
        steps: this.loopSteps(),
        lookaheadSec: this.scheduleAheadSeconds,
        startTime: context.currentTime + 0.07,
      });
    } else {
      this.startFallbackClock();
    }
    this.emitStatus();
  }

  async playArrangement(session: PulseGridSession) {
    this.playbackMode = 'arrangement';
    this.updateSession(session);
    const context = await this.ensureContext();
    if (context.state === 'suspended') await context.resume();
    await this.prepareAudioAssets();
    if (this.playing) return;

    this.playing = true;
    this.step = 0;
    const workletReady = await this.ensureWorkletClock();

    if (!this.playing) return;
    if (workletReady && this.clockNode) {
      this.clockMode = 'worklet';
      this.clockNode.port.postMessage({
        type: 'start',
        bpm: this.session?.transport.bpm || 120,
        swing: this.session?.transport.swing || 0,
        steps: this.loopSteps(),
        lookaheadSec: this.scheduleAheadSeconds,
        startTime: context.currentTime + 0.07,
      });
    } else {
      this.startFallbackClock();
    }
    this.emitStatus();
  }

  stop() {
    this.playing = false;
    if (this.fallbackTimer) clearInterval(this.fallbackTimer);
    this.fallbackTimer = null;
    if (this.clockNode) this.clockNode.port.postMessage({ type: 'stop' });
    for(const source of this.activeSources){try{source.stop()}catch{}}
    this.activeSources.clear();
    this.step = 0;
    this.onStep?.(0);
    this.emitStatus();
  }

  async close() {
    this.stop();
    this.disposeWorkletClock();
    this.disposeAllTrackBuses();
    this.master?.disconnect();
    this.master = null;
    this.noiseBuffer = null;
    this.audioBuffers.clear();
    this.pendingAssetLoads.clear();
    const context = this.context;
    this.context = null;
    this.clockMode = 'cold';
    if (context && context.state !== 'closed') await context.close();
    this.emitStatus();
  }

  private emitStatus() {
    this.onStatus?.(this.status);
  }

  private async prepareAudioAssets(){
    const context=this.context;
    const session=this.session;
    const resolver=this.assetResolver;
    if(!context||!session||!resolver)return;

    const wanted=new Map<string,PulseGridAudioAsset>();
    session.tracks.forEach((track,trackIndex)=>{
      if(track.type!=='audio')return;
      const sceneIndexes = this.playbackMode === 'arrangement'
        ? [...new Set((session.arrangement[trackIndex]||[]).filter((scene):scene is number=>Number.isInteger(scene)))]
        : [this.scene];
      for(const sceneIndex of sceneIndexes){
        const clip=track.clips[sceneIndex];
        if(!clip?.audio_asset_id)continue;
        const asset=session.assets.find((candidate)=>candidate.id===clip.audio_asset_id);
        if(asset&&asset.rights!=='restricted')wanted.set(asset.id,asset);
      }
    });

    const loads:Promise<void>[]=[];
    for(const asset of wanted.values()){
      if(this.audioBuffers.has(asset.id))continue;
      const existing=this.pendingAssetLoads.get(asset.id);
      if(existing){loads.push(existing);continue}
      const load=(async()=>{
        const blob=await resolver(asset);
        if(!blob)return;
        const bytes=await blob.arrayBuffer();
        const buffer=await context.decodeAudioData(bytes.slice(0));
        this.audioBuffers.set(asset.id,buffer);
      })().finally(()=>{
        this.pendingAssetLoads.delete(asset.id);
        this.emitStatus();
      });
      this.pendingAssetLoads.set(asset.id,load);
      loads.push(load);
    }
    await Promise.all(loads);
  }

  private trackSource<T extends AudioScheduledSourceNode>(source:T){
    this.activeSources.add(source);
    source.addEventListener('ended',()=>this.activeSources.delete(source),{once:true});
    return source;
  }

  private scheduleAudioAsset(destination:AudioNode,buffer:AudioBuffer,time:number,duration:number){
    const context=this.context!;
    const source=this.trackSource(context.createBufferSource());
    source.buffer=buffer;
    if(buffer.duration<duration){
      source.loop=true;
      source.loopEnd=Math.max(0.01,buffer.duration);
      source.connect(destination);
      source.start(time);
      source.stop(time+duration);
      return;
    }
    source.connect(destination);
    source.start(time,0,Math.min(buffer.duration,duration));
  }

  private async ensureContext() {
    if (this.context && this.master) return this.context;
    const Context = globalThis.AudioContext;
    if (!Context) throw new Error('Web Audio is unavailable in this browser.');
    this.context = new Context({ latencyHint: 'interactive' });
    this.master = this.context.createGain();
    this.master.gain.value = 0.72;
    this.master.connect(this.context.destination);
    this.ensureTrackBuses();
    this.syncAllTrackBuses(this.context.currentTime);
    this.emitStatus();
    return this.context;
  }

  private async ensureWorkletClock() {
    if (this.clockNode && this.context) return true;
    const context = this.context;
    if (!context?.audioWorklet || typeof AudioWorkletNode === 'undefined') {
      this.clockMode = 'fallback';
      return false;
    }

    try {
      const moduleUrl = new URL('./pulsegrid-clock-worklet.js', import.meta.url);
      await context.audioWorklet.addModule(moduleUrl);
      const node = new AudioWorkletNode(context, 'pulsegrid-clock', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      const sink = context.createGain();
      sink.gain.value = 0;
      node.connect(sink).connect(context.destination);
      node.port.onmessage = (event: MessageEvent) => {
        const message = event.data || {};
        if (message.type !== 'schedule' || !this.playing) return;
        const step = Number(message.step) || 0;
        const time = Number(message.time) || context.currentTime;
        this.scheduleStep(step, time);
        const delayMs = Math.max(0, (time - context.currentTime) * 1000);
        globalThis.setTimeout(() => {
          if (!this.playing) return;
          this.step = step;
          this.onStep?.(step);
          this.emitStatus();
        }, delayMs);
      };
      this.clockNode = node;
      this.clockSink = sink;
      this.clockMode = 'worklet';
      this.configureClock();
      return true;
    } catch (error) {
      console.warn('PulseGrid AudioWorklet clock unavailable; using audio-context fallback.', error);
      this.disposeWorkletClock();
      this.clockMode = 'fallback';
      return false;
    }
  }

  private disposeWorkletClock() {
    if (this.clockNode) {
      try { this.clockNode.port.postMessage({ type: 'stop' }); } catch {}
      this.clockNode.port.onmessage = null;
      try { this.clockNode.disconnect(); } catch {}
    }
    if (this.clockSink) {
      try { this.clockSink.disconnect(); } catch {}
    }
    this.clockNode = null;
    this.clockSink = null;
  }

  private configureClock() {
    if (!this.clockNode || !this.session) return;
    this.clockNode.port.postMessage({
      type: 'config',
      bpm: this.session.transport.bpm,
      swing: this.session.transport.swing,
      steps: this.loopSteps(),
      lookaheadSec: this.scheduleAheadSeconds,
    });
  }

  private startFallbackClock() {
    const context = this.context;
    if (!context || !this.playing) return;
    this.clockMode = 'fallback';
    this.step = 0;
    this.nextTime = context.currentTime + 0.06;
    if (this.fallbackTimer) clearInterval(this.fallbackTimer);
    this.fallbackTimer = setInterval(() => this.fallbackScheduler(), this.lookaheadMs);
    this.fallbackScheduler();
  }

  private fallbackScheduler() {
    const context = this.context;
    if (!context || !this.session || !this.playing) return;
    while (this.nextTime < context.currentTime + this.scheduleAheadSeconds) {
      const scheduledStep = this.step;
      const scheduledTime = this.nextTime;
      this.scheduleStep(scheduledStep, scheduledTime);
      const delayMs = Math.max(0, (scheduledTime - context.currentTime) * 1000);
      globalThis.setTimeout(() => {
        if (!this.playing || this.clockMode !== 'fallback') return;
        this.onStep?.(scheduledStep);
        this.emitStatus();
      }, delayMs);
      this.nextTime += this.stepDuration(this.step);
      this.step = (this.step + 1) % this.loopSteps();
    }
  }

  private loopSteps() {
    if (!this.session) return PULSEGRID_STEPS_PER_BAR;
    if (this.playbackMode === 'arrangement') {
      return PULSEGRID_ARRANGEMENT_BARS * PULSEGRID_STEPS_PER_BAR;
    }
    return Math.max(
      1,
      ...this.session.tracks.map((track) => track.clips[this.scene]?.steps.length || 1),
    );
  }

  private resolveArrangementPosition(trackIndex:number,track:PulseGridTrack,globalStep:number){
    const session=this.session;
    if(!session)return null;
    const bar=Math.floor(globalStep/PULSEGRID_STEPS_PER_BAR)%PULSEGRID_ARRANGEMENT_BARS;
    const stepInBar=globalStep%PULSEGRID_STEPS_PER_BAR;
    const row=session.arrangement[trackIndex];
    const scene=row?.[bar];
    if(scene===null||scene===undefined)return null;
    const clip=track.clips[scene];
    if(!clip)return null;

    let runStart=bar;
    while(runStart>0&&row[runStart-1]===scene)runStart-=1;
    let runEnd=bar;
    while(runEnd+1<PULSEGRID_ARRANGEMENT_BARS&&row[runEnd+1]===scene)runEnd+=1;

    const elapsedSteps=(bar-runStart)*PULSEGRID_STEPS_PER_BAR+stepInBar;
    const step=elapsedSteps%clip.steps.length;
    return {bar,stepInBar,scene,clip,step,runStart,runEnd};
  }

  private stepDuration(step: number) {
    const bpm = this.session?.transport.bpm || 120;
    const swing = this.session?.transport.swing || 0;
    const base = 60 / bpm / 4;
    const amount = (swing / 100) * 0.45;
    return base * (step % 2 === 0 ? 1 + amount : 1 - amount);
  }

  private ensureTrackBuses() {
    if (!this.context || !this.master || !this.session) return;
    const liveIds = new Set(this.session.tracks.map((track) => track.id));

    for (const [trackId, bus] of this.trackBuses) {
      if (liveIds.has(trackId)) continue;
      this.disconnectBus(bus);
      this.trackBuses.delete(trackId);
    }

    for (const track of this.session.tracks) {
      if (this.trackBuses.has(track.id)) continue;
      this.trackBuses.set(track.id, this.createTrackBus());
    }
  }

  private createTrackBus(): PulseGridTrackBus {
    const context = this.context!;
    const input = context.createGain();
    const filter = context.createBiquadFilter();
    const dry = context.createGain();
    const delay = context.createDelay(1);
    const feedback = context.createGain();
    const wet = context.createGain();

    filter.type = 'lowpass';
    filter.Q.value = 0.6;
    input.connect(filter);
    filter.connect(dry).connect(this.master!);
    filter.connect(delay);
    delay.connect(feedback).connect(delay);
    delay.connect(wet).connect(this.master!);
    return { input, filter, dry, delay, feedback, wet };
  }

  private syncAllTrackBuses(time: number) {
    if (!this.session) return;
    for (const track of this.session.tracks) {
      const bus = this.trackBuses.get(track.id);
      if (bus) this.scheduleBus(bus, track, 1, 1, time);
    }
  }

  private scheduleBus(
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
    bus.dry.gain.setValueAtTime(1, time);
  }

  private disconnectBus(bus: PulseGridTrackBus) {
    for (const node of [bus.input, bus.filter, bus.dry, bus.delay, bus.feedback, bus.wet]) {
      try { node.disconnect(); } catch {}
    }
  }

  private disposeAllTrackBuses() {
    for (const bus of this.trackBuses.values()) this.disconnectBus(bus);
    this.trackBuses.clear();
  }

  private scheduleStep(globalStep: number, time: number) {
    if (!this.context || !this.master || !this.session) return;
    this.ensureTrackBuses();
    const anySolo = this.session.tracks.some((track) => track.solo);

    for (let trackIndex=0; trackIndex<this.session.tracks.length; trackIndex+=1) {
      const track=this.session.tracks[trackIndex];
      if (track.muted || (anySolo && !track.solo)) continue;
      const bus = this.trackBuses.get(track.id);
      if (!bus) continue;

      const arrangementPosition = this.playbackMode === 'arrangement'
        ? this.resolveArrangementPosition(trackIndex,track,globalStep)
        : null;
      const clip = this.playbackMode === 'arrangement'
        ? arrangementPosition?.clip
        : track.clips[this.scene];
      if (!clip) continue;
      const step = arrangementPosition?.step ?? (globalStep % clip.steps.length);
      const probability = clip.probabilities[step] ?? 1;
      const microtime = (clip.microtiming[step] ?? 0) / 1000;
      const autoVolume = clip.automation.volume[step] ?? 1;
      const autoFilter = clip.automation.filter[step] ?? 1;
      this.scheduleBus(bus, track, autoVolume, autoFilter, time);

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
        const shouldStart = this.playbackMode === 'arrangement'
          ? Boolean(arrangementPosition && arrangementPosition.bar===arrangementPosition.runStart && arrangementPosition.stepInBar===0)
          : step===0;
        if(shouldStart&&clip.audio_asset_id){
          const assetBuffer=this.audioBuffers.get(clip.audio_asset_id);
          if(assetBuffer){
            const durationSteps = arrangementPosition
              ? (arrangementPosition.runEnd-arrangementPosition.runStart+1)*PULSEGRID_STEPS_PER_BAR
              : clip.steps.length;
            const playbackDuration=Array.from({length:durationSteps},(_,index)=>this.stepDuration(index))
              .reduce((total,value)=>total+value,0);
            this.scheduleAudioAsset(bus.input,assetBuffer,time,playbackDuration);
          }
        }
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
    const oscillator = this.trackSource(context.createOscillator());
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(135, time);
    oscillator.frequency.exponentialRampToValueAtTime(46, time + 0.12);
    gain.gain.setValueAtTime(Math.max(0.001, 0.7 * velocity), time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);
    oscillator.connect(gain).connect(destination);
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
    const source = this.trackSource(context.createBufferSource());
    const highpass = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = this.noiseBuffer;
    highpass.type = 'highpass';
    highpass.frequency.value = 6200;
    gain.gain.setValueAtTime(Math.max(0.001, 0.18 * velocity), time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.055);
    source.connect(highpass).connect(gain).connect(destination);
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
    const oscillator = this.trackSource(context.createOscillator());
    const gain = context.createGain();
    oscillator.type = track.id === 'bass' ? 'sawtooth' : track.id === 'bell' ? 'sine' : 'triangle';
    oscillator.frequency.value = 440 * Math.pow(2, (pitch - 69) / 12);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.005, velocity * 0.18), time + 0.008);
    gain.gain.setTargetAtTime(0.0001, time + Math.max(0.03, duration - 0.06), 0.03);
    oscillator.connect(gain).connect(destination);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.12);
  }
}
