import type { PulseGridAudioAsset, PulseGridSession, PulseGridTrack } from './pulsegrid-session.js';
import { schedulePulseGridAudioBuffer } from './pulsegrid-audio-scheduler.mjs';
import {schedulePulseGridSynthVoice} from './pulsegrid-synth-voice.mjs';
import {schedulePulseGridDrumVoice} from './pulsegrid-drum-voice.mjs';
import type {PulseGridCapturedBusStep} from './pulsegrid-bus-automation.mjs';
import type {PulseGridDrumVoice} from './pulsegrid-drum-voice.mjs';
import type {PulseGridSynthVoice} from './pulsegrid-synth-voice.mjs';
import { pulseGridNoteDurationSeconds } from './pulsegrid-note-duration.mjs';
import {foundryPedalDurationSteps,validateFoundryPedalEvents} from './instrument-foundry-pedal.mjs';
import {foundryPianoSampleTailBudget} from './instrument-foundry-tail-audit.mjs';
import {FoundryPianoPolyphonyLedger} from './instrument-foundry-polyphony.mjs';
import {analyzeFoundryDecodedPianoDryPeak,unavailableFoundryPianoDryPeak} from './instrument-foundry-dry-pcm.mjs';
import {renderFoundryPianoOfflineBus} from './instrument-foundry-offline-bus.mjs';
import type {FoundryOfflineBusResult,FoundryOfflineBusVoice,FoundryOfflineBusTrack,FoundryOfflineAudioBed} from './instrument-foundry-offline-bus.mjs';
import type {FoundryDryPcmVoice,FoundryDryPcmAudit} from './instrument-foundry-dry-pcm.mjs';
import type {FoundryPedalEvent} from './instrument-foundry-pedal.mjs';
import { pulseGridAudioAuthoritySignature } from './pulsegrid-audio-authority.mjs';
import {selectFoundrySample, scheduleFoundryPianoNote, validateFoundryPatch, planFoundryPianoPreRoll} from './instrument-foundry-piano.mjs';
import type {FoundryInstrumentPatch} from './instrument-foundry-piano.mjs';

export type PulseGridClockMode = 'cold' | 'worklet' | 'fallback';
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
  /** Audible-note scheduling flags based on decoded AudioBuffer duration, not only asset metadata. */
  decoded_sample_tail_warnings?: number;
  decoded_key_hold_shortfalls?: number;
  /** Per-Play scheduled piano voices using decoded-PCM boundary-aware onset decisions. */
  decoded_fast_attack_voices?: number;
  decoded_cut_in_guard_voices?: number;
  /** Count of sample voices offset past confidently detected operator silence. */
  decoded_preroll_aligned_voices?: number;
  /** Schedule-overlap only. These are NOT actual mix peaks or digital clipping. */
  sampled_piano_scheduled_voices?: number;
  sampled_piano_max_overlap?: number;
  sampled_piano_gain_sum_proxy?: number;
  sampled_piano_overlap_review?: boolean;
  sampled_piano_observations_complete?: boolean;
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
  private session: PulseGridSession | null = null;
  private scene = 0;
  private step = 0;
  private nextTime = 0;
  private playing = false;
  private noiseBuffer: AudioBuffer | null = null;
  private assetResolver: PulseGridAudioAssetResolver | null = null;
  private readonly audioBuffers = new Map<string, AudioBuffer>();
  private audioAuthoritySignature: string | null = null;
  private audioCacheEpoch = 0;
  private playbackAttempt = 0;
  private readonly pendingAssetLoads = new Map<string, Promise<void>>();
  private decodedSampleTailWarnings = 0;
  private decodedKeyHoldShortfalls = 0;
  private decodedFastAttackVoices = 0;
  private decodedCutInGuardVoices = 0;
  private decodedPreRollAlignedVoices = 0;
  private readonly pianoPolyphony=new FoundryPianoPolyphonyLedger();
  private readonly decodedDryPianoVoices:FoundryDryPcmVoice[]=[];
  private dryPianoVoiceOverflow=false;
  private readonly decodedAudioBeds:Array<FoundryOfflineAudioBed & {asset_id:string;autoVolume:number;autoFilter:number}>=[];
  private audioBedOverflow=false;
  private readonly capturedSynthVoices:Array<PulseGridSynthVoice & {autoVolume:number;autoFilter:number}>=[];
  private synthVoiceOverflow=false;
  private readonly capturedDrumVoices:Array<PulseGridDrumVoice & {track_id:string;autoVolume:number;autoFilter:number}>=[];
  private drumVoiceOverflow=false;
  private readonly capturedBusAutomation:PulseGridCapturedBusStep[]=[];
  private busAutomationOverflow=false;
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
    const overlap=this.pianoPolyphony.snapshot();
    return {
      playing: this.playing,
      scene: this.scene,
      step: this.step,
      context_state: context?.state || 'cold',
      clock_mode: this.clockMode,
      track_buses: this.trackBuses.size,
      latency_ms: context ? Math.round(latencySeconds * 1000) : null,
      cached_audio_assets: this.audioBuffers.size,
      decoded_sample_tail_warnings:this.decodedSampleTailWarnings,
      decoded_key_hold_shortfalls:this.decodedKeyHoldShortfalls,
      decoded_fast_attack_voices:this.decodedFastAttackVoices,
      decoded_cut_in_guard_voices:this.decodedCutInGuardVoices,
      decoded_preroll_aligned_voices:this.decodedPreRollAlignedVoices,
      sampled_piano_scheduled_voices:overlap.observed_voices,
      sampled_piano_max_overlap:overlap.max_simultaneous_voices,
      sampled_piano_gain_sum_proxy:overlap.peak_summed_voice_gain,
      sampled_piano_overlap_review:overlap.review_gain_summation,
      sampled_piano_observations_complete:overlap.observation_complete,
    };
  }

  // Do not carry a decoded recording across project, rights, source or
  // resolver boundaries. Existing in-flight reads are discarded by epoch.
  private invalidateAudioCache() {
    this.audioCacheEpoch += 1;
    this.audioBuffers.clear();
    this.pendingAssetLoads.clear();
    this.decodedDryPianoVoices.length=0;
    this.dryPianoVoiceOverflow=false;
    this.decodedAudioBeds.length=0;
    this.audioBedOverflow=false;
    this.capturedSynthVoices.length=0;
    this.synthVoiceOverflow=false;
    this.capturedDrumVoices.length=0;
    this.drumVoiceOverflow=false;
    this.capturedBusAutomation.length=0;
    this.busAutomationOverflow=false;
    this.emitStatus();
  }

  /**
   * EXPLICIT stopped-playback PCM-only audit, strictly limited to the
   * authorized decoded WAVs from this Play. No offline render in the
   * real-time scheduler, no effects-chain or device-output assertions.
   */
  auditRecordedPianoDryPeak():FoundryDryPcmAudit {
    if(this.playing)return unavailableFoundryPianoDryPeak('Stop playback before inspecting decoded PCM.');
    if(this.dryPianoVoiceOverflow || !this.pianoPolyphony.snapshot().observation_complete ||
       this.pianoPolyphony.snapshot().observed_voices!==this.decodedDryPianoVoices.length)
      return unavailableFoundryPianoDryPeak('Recorded notes exceed the bounded PCM audit. Inspect a shorter phrase.');
    if(this.decodedDryPianoVoices.some(v=>!this.audioBuffers.has(
        (v as FoundryDryPcmVoice & {asset_id?:string}).asset_id||'')))
      return unavailableFoundryPianoDryPeak('The recording authority changed; no verified decoded sample is available.');
    return analyzeFoundryDecodedPianoDryPeak({voices:this.decodedDryPianoVoices});
  }

  /**
   * Explicit, non-real-time OFFLINE piano-bus render, never a live-stream
   * meter or whole-song mix. The bound WAV cache remains permission-scoped.
   */
  async auditRecordedPianoOfflineBus(options:{window_sec?:0.8|8;includeAuditionWav?:boolean}={}):Promise<FoundryOfflineBusResult> {
    const unavailable=(reason:string):FoundryOfflineBusResult=>({
      status:'unavailable',scope:'offline_sampled_piano_track_bus_approximation',
      reason,peak_dbfs:null,sample_peak:null,over_full_scale_frames:null,
      complete:false,analyzed_voices:0,source_kind:'decoded_pcm_only',
    });
    if(this.playing)return unavailable('Stop playback before offline effects-bus analysis.');
    const voices=this.decodedDryPianoVoices as Array<FoundryDryPcmVoice & FoundryOfflineBusVoice & {
      asset_id?:string;autoVolume?:number;autoFilter?:number;
    }>;
    if(!voices.length||this.dryPianoVoiceOverflow||this.audioBedOverflow||this.synthVoiceOverflow||this.drumVoiceOverflow||this.busAutomationOverflow||
       !this.pianoPolyphony.snapshot().observation_complete||
       this.pianoPolyphony.snapshot().observed_voices!==voices.length)
      return unavailable('No complete bounded authorized sampled-piano phrase is available.');
    if(voices.some(v=>!v.asset_id||!this.audioBuffers.has(v.asset_id)||
       this.audioBuffers.get(v.asset_id)!==v.buffer)||
       this.decodedAudioBeds.some(b=>!this.audioBuffers.has(b.asset_id)||
         this.audioBuffers.get(b.asset_id)!==b.buffer))
      return unavailable('The authorized decoded samples are no longer available.');
    if(!this.session)return unavailable('The canonical session is unavailable.');
    const snapshots=new Map<string,FoundryOfflineBusTrack>();
    for(const v of [...voices,...this.decodedAudioBeds,...this.capturedSynthVoices,...this.capturedDrumVoices]){
      const track=this.session.tracks.find(t=>t.id===v.track_id);
      if(!track||!['synth','audio','drums'].includes(track.type)||track.muted||!Number.isFinite(v.autoVolume)||
         !Number.isFinite(v.autoFilter))
        return unavailable('Track or effect automation cannot be reconstructed safely.');
      const snapshot:FoundryOfflineBusTrack={
        id:track.id,volume:track.volume,filterHz:track.filterHz,
        delayMix:track.delayMix,delayTime:track.delayTime,
        delayFeedback:track.delayFeedback,
        autoVolume:v.autoVolume!,autoFilter:v.autoFilter!,
      };
      const prior=snapshots.get(track.id);
      // Dynamic volume/filter are reconstructed from actual scheduled bus
      // steps below, but static effects must remain consistent.
      if(prior&&(
        prior.volume!==snapshot.volume||prior.filterHz!==snapshot.filterHz||
        prior.delayMix!==snapshot.delayMix||prior.delayTime!==snapshot.delayTime||
        prior.delayFeedback!==snapshot.delayFeedback))
        return unavailable('Static track effects changed during performance.');
      if(prior&&!this.capturedBusAutomation.length&&
        (prior.autoVolume!==snapshot.autoVolume||prior.autoFilter!==snapshot.autoFilter))
        return unavailable('Cannot reconstruct automation without scheduled bus steps.');
      snapshots.set(track.id,snapshot);
    }
    const Offline=globalThis.OfflineAudioContext;
    if(!Offline)return unavailable('This browser does not support OfflineAudioContext.');
    const sessionAtStart=this.session;
    const authority=this.audioAuthoritySignature;
    const cacheEpoch=this.audioCacheEpoch;
    const attempt=this.playbackAttempt;
    const rendered=await renderFoundryPianoOfflineBus({
      voices,audioBeds:this.decodedAudioBeds,synthVoices:this.capturedSynthVoices,
      drumVoices:this.capturedDrumVoices,
      automationEvents:this.capturedBusAutomation.filter(e=>snapshots.has(e.track_id)),
      window_sec:options.window_sec??.8,
      includeAuditionWav:options.includeAuditionWav??false,
      tracks:Array.from(snapshots.values()),
      offlineContextFactory:(channels,frames,rate)=>new Offline(channels,frames,rate),
    });
    if(this.playing||sessionAtStart!==this.session||authority!==this.audioAuthoritySignature||
       cacheEpoch!==this.audioCacheEpoch||attempt!==this.playbackAttempt)
      return unavailable('Audio authorization or playback state changed during the offline review.');
    const omittedTrackIds=this.session.tracks.filter(t=>
      !t.muted&&!snapshots.has(t.id)).map(t=>t.id);
    const stepTimes=this.capturedBusAutomation.map(e=>e.time);
    const bpm=this.session.transport.bpm;
    // Conservative count of the observed, actually SCHEDULED transport
    // horizon, NOT the length of the OfflineAudioContext output buffer.
    const observed=stepTimes.length>0&&Number.isFinite(bpm)&&bpm>0
      ?Math.max(...stepTimes)-Math.min(...stepTimes)+60/bpm/4:0;
    const requested=options.window_sec??.8;
    return {...rendered,omitted_track_ids:omittedTrackIds,
      included_track_ids:Array.from(snapshots.keys()),
      performance_coverage_sec:Number(observed.toFixed(3)),
      performance_window_complete:observed>=requested-1e-4};
  }

  setAudioAssetResolver(resolver:PulseGridAudioAssetResolver|null){
    if(this.assetResolver===resolver)return;
    if(this.playing)this.stop();
    this.playbackAttempt+=1; // Cancel even a Play still waiting for Web Audio initialization.
    this.assetResolver=resolver;
    this.invalidateAudioCache();
  }

  updateSession(session: PulseGridSession) {
    const authority=pulseGridAudioAuthoritySignature(session);
    if(this.audioAuthoritySignature!==authority){
      if(this.playing)this.stop();
      this.playbackAttempt+=1;
      this.audioAuthoritySignature=authority;
      this.invalidateAudioCache();
    }
    this.session=structuredClone(session);
    this.scene=Math.max(0,Math.min(this.scene,Math.max(0,session.tracks[0]?.clips.length-1||0)));
    if(this.context){
      this.ensureTrackBuses();
      this.syncAllTrackBuses(this.context.currentTime);
      this.configureClock();
      // No fire-and-forget reads: verified audio is loaded and awaited in play().
    }
    this.emitStatus();
  }

  setScene(scene: number) {
    const maxScene = Math.max(0, (this.session?.tracks[0]?.clips.length || 1) - 1);
    const nextScene = Math.max(0, Math.min(Math.round(scene), maxScene));
    // Do not keep a transport running into a different scene until its
    // recorded samples have been authorized, verified and decoded. This
    // deliberately requires a new Play press instead of silent note loss.
    if(nextScene!==this.scene){
      if(this.playing)this.stop();
      this.playbackAttempt+=1;
      this.invalidateAudioCache();
    }
    this.scene = nextScene;
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
    if(this.playing)this.stop();
    this.updateSession(session);
    this.setScene(scene);
    // Reauthorize on EVERY explicit Play. A locally cached buffer from an
    // older audition never grants permission to play it again.
    const attempt=++this.playbackAttempt;
    this.invalidateAudioCache();
    const context=await this.ensureContext();
    if(context.state==='suspended')await context.resume();
    if(attempt!==this.playbackAttempt)throw new Error('PulseGrid playback start superseded.');
    await this.prepareAudioAssets();
    if(attempt!==this.playbackAttempt)throw new Error('PulseGrid playback start superseded.');

    this.playing=true;
    this.step=0;
    this.decodedSampleTailWarnings=0;
    this.decodedKeyHoldShortfalls=0;
    this.decodedFastAttackVoices=0;
    this.decodedCutInGuardVoices=0;
    this.decodedPreRollAlignedVoices=0;
    this.pianoPolyphony.reset();
    this.decodedDryPianoVoices.length=0;
    this.dryPianoVoiceOverflow=false;
    this.decodedAudioBeds.length=0;
    this.audioBedOverflow=false;
    this.capturedSynthVoices.length=0;
    this.synthVoiceOverflow=false;
    this.capturedDrumVoices.length=0;
    this.drumVoiceOverflow=false;
    this.capturedBusAutomation.length=0;
    this.busAutomationOverflow=false;
    const workletReady=await this.ensureWorkletClock();
    if(attempt!==this.playbackAttempt)throw new Error('PulseGrid playback start superseded.');

    if(workletReady&&this.clockNode){
      this.clockMode='worklet';
      this.clockNode.port.postMessage({
        type:'start',bpm:this.session?.transport.bpm||120,
        swing:this.session?.transport.swing||0,
        steps:this.loopSteps(),lookaheadSec:this.scheduleAheadSeconds,
        startTime:context.currentTime+0.07,
      });
    }else{
      this.startFallbackClock();
    }
    this.emitStatus();
  }

  stop() {
    this.playbackAttempt += 1;
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
    this.invalidateAudioCache();
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
    if(!context||!session)return;
    const requiresVerifiedAudio=session.tracks.some(track=>{
      const clip=track.clips[this.scene];
      return Boolean(clip?.audio_asset_id || clip?.provenance?.foundry_piano_patch);
    });
    if(!resolver){
      if(requiresVerifiedAudio)throw new Error('PulseGrid verified audio resolver is required for sampled playback.');
      return;
    }

    const wanted=new Map<string,PulseGridAudioAsset>();
    for(const track of session.tracks){
      const clip=track.clips[this.scene];
      if(!clip)continue;
      if(track.type==='audio'&&clip.audio_asset_id){
        const asset=session.assets.find((candidate)=>candidate.id===clip.audio_asset_id);
        if(!asset||asset.rights==='restricted')throw new Error('PulseGrid audio take is missing or restricted.');
        wanted.set(asset.id,asset);
      }
      if(clip.provenance?.foundry_piano_patch){
        const patch=clip.provenance.foundry_piano_patch as FoundryInstrumentPatch;
        if(track.type!=='synth')throw new Error('Recorded piano patch requires a synth instrument track.');
        validateFoundryPatch(patch,session.assets);
        validateFoundryPedalEvents((clip.provenance?.foundry_piano_pedal??[]) as FoundryPedalEvent[],clip.steps.length);
        for(const note of clip.notes){
          const selected=selectFoundrySample(patch,note.pitch,note.velocity);
          const asset=session.assets.find(candidate=>candidate.id===selected.asset_id);
          if(!asset)throw new Error('Foundry recording missing from canonical graph.');
          wanted.set(asset.id,asset);
        }
      }
    }

    const loads:Promise<void>[]=[];
    for(const asset of wanted.values()){
      if(this.audioBuffers.has(asset.id))continue;
      const existing=this.pendingAssetLoads.get(asset.id);
      if(existing){loads.push(existing);continue}
      const epoch=this.audioCacheEpoch;
      const checkActive=()=>epoch===this.audioCacheEpoch&&resolver===this.assetResolver&&
        context===this.context&&this.session?.session_id===session.session_id;
      const load=(async()=>{
        const blob=await resolver(asset);
        if(!blob)throw new Error('PulseGrid audio asset is missing from verified storage: '+asset.id);
        if(!checkActive())throw new Error('PulseGrid audio authorization changed during loading.');
        const bytes=await blob.arrayBuffer();
        const buffer=await context.decodeAudioData(bytes.slice(0));
        if(!checkActive())throw new Error('PulseGrid audio authorization changed during decoding.');
        this.audioBuffers.set(asset.id,buffer);
      })();
      const tracked=load.finally(()=>{
        if(this.pendingAssetLoads.get(asset.id)===tracked)this.pendingAssetLoads.delete(asset.id);
        this.emitStatus();
      });
      this.pendingAssetLoads.set(asset.id,tracked);
      loads.push(tracked);
    }
    await Promise.all(loads);
  }

  private trackSource<T extends AudioScheduledSourceNode>(source:T){
    this.activeSources.add(source);
    source.addEventListener('ended',()=>this.activeSources.delete(source),{once:true});
    return source;
  }

  private scheduleAudioAsset(destination:AudioNode,buffer:AudioBuffer,time:number,duration:number,mode:'loop'|'one_shot'='loop'){
    const context=this.context!;
    return schedulePulseGridAudioBuffer({
      buffer,time,duration,mode,destination,
      createSource:()=>this.trackSource(context.createBufferSource()),
    });
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

    for (const track of this.session.tracks) {
      if (track.muted || (anySolo && !track.solo)) continue;
      const clip = track.clips[this.scene];
      const bus = this.trackBuses.get(track.id);
      if (!clip || !bus) continue;

      const step = globalStep % clip.steps.length;
      const probability = clip.probabilities[step] ?? 1;
      const microtime = (clip.microtiming[step] ?? 0) / 1000;
      const autoVolume = clip.automation.volume[step] ?? 1;
      const autoFilter = clip.automation.filter[step] ?? 1;
      this.scheduleBus(bus, track, autoVolume, autoFilter, time);
      // Capture live scheduled automation even on silent steps. This is what
      // the offline renderer must replay. Do not infer any future steps.
      if(this.capturedBusAutomation.length<1024){
        this.capturedBusAutomation.push({
          track_id:track.id,time,autoVolume,autoFilter,
          trackVolume:track.volume,trackFilterHz:track.filterHz,
        });
      }else this.busAutomationOverflow=true;

      const velocity = clip.steps[step] || 0;
      if (track.type === 'drums') {
        if (velocity > 0 && Math.random() <= probability) {
          if (step % 4 === 0 || velocity > 0.85) this.kick(bus.input, time + microtime, velocity,track.id,autoVolume,autoFilter);
          if (step % 2 === 0 || step % 4 === 3) {
            this.hat(bus.input, time + microtime + 0.004, Math.max(0.12, velocity * 0.34),track.id,autoVolume,autoFilter);
          }
        }
        continue;
      }

      if (track.type === 'audio') {
        if(step===0&&clip.audio_asset_id){
          const assetBuffer=this.audioBuffers.get(clip.audio_asset_id);
          if(assetBuffer){
            const sceneDuration=Array.from({length:clip.steps.length},(_,index)=>this.stepDuration(index))
              .reduce((total,value)=>total+value,0);
            const mode=clip.provenance?.audio_playback_mode==='one_shot'?'one_shot':'loop';
            this.scheduleAudioAsset(bus.input,assetBuffer,time,sceneDuration,mode);
            if(this.decodedAudioBeds.length<4){
              this.decodedAudioBeds.push({
                track_id:track.id,buffer:assetBuffer,asset_id:clip.audio_asset_id,
                start_time:time,duration:sceneDuration,mode,autoVolume,autoFilter,
              });
            }else this.audioBedOverflow=true;
          }
        }
        continue;
      }

      const noteEvents = clip.notes.filter((note) => Math.round(note.start) === step);
      const foundryPatch=clip.provenance?.foundry_piano_patch as FoundryInstrumentPatch|undefined;
      for (const note of noteEvents) {
        if (Math.random() > (note.probability ?? 1)) continue;
        const noteTime=time+(note.microtiming||0)/1000;
        const noteDuration=pulseGridNoteDurationSeconds({
          bpm:this.session.transport.bpm,
          swing:this.session.transport.swing,
          start_step:step,
          length_steps:Math.max(0.01,note.length),
        });
        if(foundryPatch){
          const heldSteps=foundryPedalDurationSteps({
            events:(clip.provenance?.foundry_piano_pedal??[]) as FoundryPedalEvent[],
            start_step:step,length_steps:Math.max(0.01,note.length),clip_steps:clip.steps.length,
          });
          const heldDuration=pulseGridNoteDurationSeconds({
            bpm:this.session.transport.bpm,swing:this.session.transport.swing,
            start_step:step,length_steps:heldSteps,
          });
          const selected=selectFoundrySample(foundryPatch,note.pitch,note.velocity);
          const buffer=this.audioBuffers.get(selected.asset_id);
          if(!buffer)throw new Error('Verified Foundry piano recording was not prepared: '+selected.asset_id);
          // Unlike the score panel's asset metadata estimate, this checks
          // the actual decoded Web Audio buffer used to schedule this voice.
          // Count scheduled events, not unique score notes across loop cycles.
          const preRoll=planFoundryPianoPreRoll(buffer);
          const actualTail=foundryPianoSampleTailBudget({
            sample_duration_sec:buffer.duration-preRoll.offset_sec,
            playback_rate:selected.playback_rate,
            held_seconds:heldDuration,
            release_sec:selected.release_sec,
          });
          if(actualTail.classification!=='sufficient_metadata_duration'){
            this.decodedSampleTailWarnings+=1;
            if(actualTail.classification==='key_hold_shortfall')this.decodedKeyHoldShortfalls+=1;
          }
          const sampledVoice=scheduleFoundryPianoNote({
            context:this.context,destination:bus.input,buffer,pitch:note.pitch,
            velocity:note.velocity,time:noteTime,duration:heldDuration,selection:selected,
            createSource:()=>this.trackSource(this.context!.createBufferSource()),
          });
          if(sampledVoice.attack_profile==='zero_aligned_fast_attack')this.decodedFastAttackVoices+=1;
          if(sampledVoice.attack_profile==='cut_in_microfade_guard')this.decodedCutInGuardVoices+=1;
          if(sampledVoice.pre_roll_profile==='verified_quiet_preroll_aligned')this.decodedPreRollAlignedVoices+=1;
          this.pianoPolyphony.record({
            track_id:track.id,start_time:sampledVoice.start_time,
            stop_time:sampledVoice.stop_time,voice_gain:sampledVoice.voice_gain,
          });
          if(this.decodedDryPianoVoices.length<16){
            this.decodedDryPianoVoices.push({
              ...sampledVoice,buffer,asset_id:selected.asset_id,
              track_id:track.id,pitch:note.pitch,velocity:note.velocity,
              duration:heldDuration,selection:selected,
              autoVolume,autoFilter,
            } as FoundryDryPcmVoice);
          }else this.dryPianoVoiceOverflow=true;
        }else{
          this.note(bus.input,track,note.pitch,noteTime,noteDuration,note.velocity,autoVolume,autoFilter);
        }
      }

      if (!foundryPatch && !noteEvents.length && velocity > 0 && Math.random() <= probability) {
        const pitch = track.id === 'bass' ? 36 : track.id === 'bell' ? 72 : 60;
        this.note(bus.input, track, pitch, time + microtime, this.stepDuration(step) * 0.85, velocity,autoVolume,autoFilter);
      }
    }
  }

  private captureDrumVoice(voice:PulseGridDrumVoice,track_id:string,autoVolume:number,autoFilter:number){
    if(this.capturedDrumVoices.length<16){
      this.capturedDrumVoices.push({...voice,track_id,autoVolume,autoFilter});
    }else this.drumVoiceOverflow=true;
  }

  private kick(destination:AudioNode,time:number,velocity:number,track_id:string,autoVolume:number,autoFilter:number){
    const context=this.context!;
    const performed=schedulePulseGridDrumVoice({
      context,destination,kind:'kick',time,velocity,
      createOscillator:()=>this.trackSource(context.createOscillator()),
    });
    this.captureDrumVoice(performed,track_id,autoVolume,autoFilter);
  }

  private hat(destination:AudioNode,time:number,velocity:number,track_id:string,autoVolume:number,autoFilter:number){
    const context=this.context!;
    if(!this.noiseBuffer){
      const buffer=context.createBuffer(1,Math.round(context.sampleRate*.09),context.sampleRate);
      const data=buffer.getChannelData(0);
      for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
      this.noiseBuffer=buffer;
    }
    const performed=schedulePulseGridDrumVoice({
      context,destination,kind:'hat',time,velocity,noiseBuffer:this.noiseBuffer,
      createBufferSource:()=>this.trackSource(context.createBufferSource()),
    });
    this.captureDrumVoice(performed,track_id,autoVolume,autoFilter);
  }

  private note(
    destination: AudioNode,
    track: PulseGridTrack,
    pitch: number,
    time: number,
    duration: number,
    velocity: number,
    autoVolume:number,
    autoFilter:number,
  ) {
    const context=this.context!;
    const scheduled=schedulePulseGridSynthVoice({
      context,destination,track_id:track.id,pitch,velocity,time,duration,
      createSource:()=>this.trackSource(context.createOscillator()),
    });
    if(this.capturedSynthVoices.length<16){
      this.capturedSynthVoices.push({...scheduled,autoVolume,autoFilter});
    }else this.synthVoiceOverflow=true;
  }
}
