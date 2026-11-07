import {validateFoundryPatch, selectFoundrySample} from './instrument-foundry-piano.mjs';
import {validateFoundryPedalEvents} from './instrument-foundry-pedal.mjs';
import type {FoundryPedalEvent} from './instrument-foundry-pedal.mjs';
import type {FoundryInstrumentPatch} from './instrument-foundry-piano.mjs';

export const PULSEGRID_SESSION_SCHEMA = 'evercraft.fallen.pulsegrid.session.v1';
export const PULSEGRID_ENGINE_VERSION = '0.14.0';
export const PULSEGRID_ARRANGEMENT_BARS = 16;

export type PulseGridActor = 'human' | 'agent' | 'system' | 'controller';

export type PulseGridAudioAssetSourceState = 'recording' | 'imported' | 'generated' | 'bounce';
export type PulseGridAudioAssetRights = 'owned' | 'licensed' | 'unknown' | 'restricted';

export type PulseGridAudioAsset = {
  id: string;
  digest: string;
  kind: 'audio';
  mime_type: string;
  byte_length: number;
  duration_sec: number;
  sample_rate: number;
  channels: number;
  source_name: string | null;
  source_refs: string[];
  source_state: PulseGridAudioAssetSourceState;
  rights: PulseGridAudioAssetRights;
  created_at: string;
  parent_asset_ids: string[];
};

export type PulseGridAudioAssetInput = Omit<PulseGridAudioAsset, 'id' | 'kind' | 'created_at'> & {
  created_at?: string;
};


export type PulseGridNote = {
  id: string;
  pitch: number;
  start: number;
  length: number;
  velocity: number;
  probability: number;
  microtiming: number;
};

export type PulseGridClip = {
  id: string;
  name: string;
  bars: number;
  steps_per_bar: number;
  steps: number[];
  probabilities: number[];
  microtiming: number[];
  notes: PulseGridNote[];
  audio_asset_id: string | null;
  automation: {
    volume: number[];
    filter: number[];
  };
  provenance: Record<string, unknown>;
};

export type PulseGridTrack = {
  id: string;
  name: string;
  type: 'drums' | 'synth' | 'audio';
  volume: number;
  muted: boolean;
  solo: boolean;
  filterHz: number;
  delayMix: number;
  delayTime: number;
  delayFeedback: number;
  clips: PulseGridClip[];
};

export type PulseGridReceipt = {
  id: string;
  timestamp: string;
  actor: PulseGridActor;
  operation: string;
  targets: string[];
  before: unknown;
  after: unknown;
  reversible: boolean;
  request?: PulseGridOperation | PulseGridTransactionRequest | null;
  undo_of?: string | null;
  transaction_id?: string | null;
  child_receipt_ids?: string[] | null;
  intent?: string | null;
};

export type PulseGridSession = {
  schema: typeof PULSEGRID_SESSION_SCHEMA;
  version: string;
  session_id: string;
  project_name: string;
  transport: {
    bpm: number;
    swing: number;
    time_signature: [number, number];
  };
  active_scene: number;
  assets: PulseGridAudioAsset[];
  tracks: PulseGridTrack[];
  arrangement: Array<Array<number | null>>;
  receipts: PulseGridReceipt[];
};

export type PulseGridOperation =
  | { type: 'transport.set_tempo'; bpm: number }
  | { type: 'transport.set_swing'; swing: number }
  | { type: 'track.set_filter'; track_id: string; filter_hz: number }
  | { type: 'track.set_delay_mix'; track_id: string; mix: number }
  | { type: 'clip.set_bars'; track_id: string; scene: number; bars: number }
  | { type: 'clip.set_step'; track_id: string; scene: number; step: number; velocity: number }
  | {
      type: 'clip.set_step_expression';
      track_id: string;
      scene: number;
      step: number;
      velocity?: number;
      probability?: number;
      microtiming?: number;
    }
  | {
      type: 'clip.set_automation_point';
      track_id: string;
      scene: number;
      parameter: 'volume' | 'filter';
      step: number;
      value: number;
    }
  | { type: 'arrangement.set_slot'; track_id: string; bar: number; scene: number | null }
  | { type: 'clip.fork_variation'; track_id: string; source_scene: number; destination_scene: number; name?: string }
  | { type: 'clip.set_audio_playback_mode'; track_id: string; scene: number; mode: 'loop' | 'one_shot' }
  | { type: 'clip.set_foundry_piano_patch'; track_id: string; scene: number; patch: FoundryInstrumentPatch | null }
  | { type: 'clip.set_foundry_piano_pedal'; track_id: string; scene: number; events: FoundryPedalEvent[] | null }
  | { type: 'asset.register_audio'; asset: PulseGridAudioAssetInput }
  | { type: 'clip.attach_audio_asset'; track_id: string; scene: number; asset_id: string | null }
  | {
      type: 'note.add';
      track_id: string;
      scene: number;
      note: {
        id?: string;
        pitch: number;
        start: number;
        length?: number;
        velocity?: number;
        probability?: number;
        microtiming?: number;
      };
    }
  | { type: 'note.move'; track_id: string; scene: number; note_id: string; start: number; pitch: number }
  | { type: 'note.resize'; track_id: string; scene: number; note_id: string; length: number }
  | {
      type: 'note.set_expression';
      track_id: string;
      scene: number;
      note_id: string;
      velocity?: number;
      probability?: number;
      microtiming?: number;
    }
  | { type: 'note.delete'; track_id: string; scene: number; note_id: string };

export type PulseGridTransactionRequest = {
  type: 'transaction.apply';
  transaction_id: string;
  intent: string;
  operations: PulseGridOperation[];
};

export type PulseGridTransactionInput = {
  transaction_id?: string;
  intent: string;
  operations: PulseGridOperation[];
};

export const PULSEGRID_STEPS_PER_BAR = 16;
export const PULSEGRID_MAX_CLIP_BARS = 16;
const SCENES = 4;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function randomId() {
  const runtimeCrypto=globalThis.crypto;
  if(runtimeCrypto && typeof runtimeCrypto.randomUUID==='function'){
    return runtimeCrypto.randomUUID();
  }
  // Local graph identity fallback only. Never use this fallback for authentication or secrets.
  return 'pg-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,12);
}

const SHA256_HEX=/^[a-f0-9]{64}$/;

export function pulseGridAudioAssetId(digestInput:string){
  const digest=String(digestInput||'').trim().toLowerCase();
  if(!SHA256_HEX.test(digest)) throw new Error('PulseGrid audio asset digest must be a 64-character SHA-256 hex string.');
  return 'audio-sha256:'+digest;
}

function normalizeAudioAsset(raw:any):PulseGridAudioAsset{
  const digest=String(raw?.digest||'').trim().toLowerCase();
  const id=pulseGridAudioAssetId(digest);
  const sourceState:PulseGridAudioAssetSourceState=
    raw?.source_state==='recording'||raw?.source_state==='generated'||raw?.source_state==='bounce'
      ? raw.source_state
      : 'imported';
  const rights:PulseGridAudioAssetRights=
    raw?.rights==='owned'||raw?.rights==='licensed'||raw?.rights==='restricted'
      ? raw.rights
      : 'unknown';
  const sourceRefs=Array.from(new Set<string>(
    (Array.isArray(raw?.source_refs)?raw.source_refs:[])
      .map((value:unknown)=>String(value||'').trim())
      .filter((value:string)=>value.length>0),
  )).slice(0,64);
  const parentAssetIds=Array.from(new Set<string>(
    (Array.isArray(raw?.parent_asset_ids)?raw.parent_asset_ids:[])
      .map((value:unknown)=>String(value||'').trim())
      .filter((value:string)=>value.length>0),
  )).filter((value)=>value!==id).slice(0,64);
  return {
    id,
    digest,
    kind:'audio',
    mime_type:String(raw?.mime_type||'application/octet-stream').trim()||'application/octet-stream',
    byte_length:Math.max(0,Math.round(Number(raw?.byte_length)||0)),
    duration_sec:Math.max(0,Number(raw?.duration_sec)||0),
    sample_rate:Math.max(1,Math.round(Number(raw?.sample_rate)||1)),
    channels:clamp(Math.round(Number(raw?.channels)||1),1,32),
    source_name:raw?.source_name==null?null:String(raw.source_name).slice(0,512),
    source_refs:sourceRefs,
    source_state:sourceState,
    rights,
    created_at:String(raw?.created_at||new Date().toISOString()),
    parent_asset_ids:parentAssetIds,
  };
}

function conservativeRights(a:PulseGridAudioAssetRights,b:PulseGridAudioAssetRights):PulseGridAudioAssetRights{
  const rank:Record<PulseGridAudioAssetRights,number>={owned:0,licensed:1,unknown:2,restricted:3};
  return rank[a]>=rank[b]?a:b;
}

function vector(value: unknown, fallback: number, length: number) {
  const input = Array.isArray(value) ? value : [];
  return Array.from({ length }, (_, index) => {
    const raw = Number(input[index]);
    return Number.isFinite(raw) ? raw : fallback;
  });
}

function inferredBars(raw: any) {
  const explicit = Number(raw?.bars);
  if (Number.isFinite(explicit) && explicit > 0) {
    return clamp(Math.round(explicit), 1, PULSEGRID_MAX_CLIP_BARS);
  }
  const arrayLengths = [
    raw?.steps?.length,
    raw?.probabilities?.length,
    raw?.microtiming?.length,
    raw?.automation?.volume?.length,
    raw?.automation?.filter?.length,
  ].filter((value) => Number.isFinite(value) && value > 0) as number[];
  const noteExtent = Array.isArray(raw?.notes)
    ? raw.notes.reduce(
        (max: number, note: any) =>
          Math.max(max, Math.max(0, Number(note?.start) || 0) + Math.max(0.01, Number(note?.length) || 1)),
        0,
      )
    : 0;
  const requiredSteps = Math.max(PULSEGRID_STEPS_PER_BAR, ...arrayLengths, Math.ceil(noteExtent));
  return clamp(Math.ceil(requiredSteps / PULSEGRID_STEPS_PER_BAR), 1, PULSEGRID_MAX_CLIP_BARS);
}

function normalizeNote(raw: any, clipId: string, index: number, clipSteps: number): PulseGridNote {
  const start = clamp(Math.round(Number(raw?.start) || 0), 0, Math.max(0, clipSteps - 1));
  const maxLength = Math.max(0.01, clipSteps - start);
  return {
    id: String(raw?.id || `${clipId}-note-${index + 1}`),
    pitch: clamp(Math.round(Number(raw?.pitch) || 60), 0, 127),
    start,
    length: clamp(Number(raw?.length) || 1, 0.01, maxLength),
    velocity: clamp(Number(raw?.velocity) || 0.72, 0, 1),
    probability: clamp(Number(raw?.probability ?? 1), 0, 1),
    microtiming: clamp(Number(raw?.microtiming) || 0, -1000, 1000),
  };
}

function migrateClip(raw: any, fallbackId: string): PulseGridClip {
  const bars = inferredBars(raw);
  const clipSteps = bars * PULSEGRID_STEPS_PER_BAR;
  const id = String(raw?.id || fallbackId);
  return {
    id,
    name: String(raw?.name || fallbackId),
    bars,
    steps_per_bar: PULSEGRID_STEPS_PER_BAR,
    steps: vector(raw?.steps, 0, clipSteps).map((value) => clamp(value, 0, 1)),
    probabilities: vector(raw?.probabilities, 1, clipSteps).map((value) => clamp(value, 0, 1)),
    microtiming: vector(raw?.microtiming, 0, clipSteps).map((value) => clamp(value, -1000, 1000)),
    notes: Array.isArray(raw?.notes)
      ? raw.notes.map((note: any, index: number) => normalizeNote(note, id, index, clipSteps))
      : [],
    audio_asset_id: raw?.audio_asset_id || raw?.audioAssetId
      ? String(raw.audio_asset_id || raw.audioAssetId)
      : null,
    automation: {
      volume: vector(raw?.automation?.volume, 1, clipSteps).map((value) => clamp(value, 0, 1)),
      filter: vector(raw?.automation?.filter, 1, clipSteps).map((value) => clamp(value, 0, 1)),
    },
    provenance: raw?.provenance && typeof raw.provenance === 'object'
      ? { ...raw.provenance }
      : { kind: 'migrated' },
  };
}

function defaultTrack(id: string, name: string, type: PulseGridTrack['type']): PulseGridTrack {
  const filterHz = id === 'bass' ? 1200 : id === 'drums' ? 12000 : 7000;
  const delayMix = id === 'bell' ? 0.18 : id === 'keys' ? 0.08 : 0;
  return {
    id,
    name,
    type,
    volume: 0.8,
    muted: false,
    solo: false,
    filterHz,
    delayMix,
    delayTime: 0.24,
    delayFeedback: 0.22,
    clips: Array.from({ length: SCENES }, (_, scene) =>
      migrateClip({}, `${id}-scene-${scene + 1}`),
    ),
  };
}

export function createPulseGridSession(projectName = 'Untitled Session'): PulseGridSession {
  const tracks = [
    defaultTrack('drums', 'Pulse Drums', 'drums'),
    defaultTrack('bass', 'Ember Bass', 'synth'),
    defaultTrack('keys', 'Neon Keys', 'synth'),
    defaultTrack('bell', 'Glass Bell', 'synth'),
    defaultTrack('audio', 'Audio Take', 'audio'),
  ];
  return {
    schema: PULSEGRID_SESSION_SCHEMA,
    version: PULSEGRID_ENGINE_VERSION,
    session_id: randomId(),
    project_name: projectName.trim() || 'Untitled Session',
    transport: { bpm: 120, swing: 0, time_signature: [4, 4] },
    active_scene: 0,
    assets: [],
    tracks,
    arrangement: tracks.map(() => Array.from({ length: PULSEGRID_ARRANGEMENT_BARS }, () => null)),
    receipts: [],
  };
}

export function migratePulseGridSession(raw: any): PulseGridSession {
  const base = createPulseGridSession(String(raw?.project_name || raw?.projectName || 'Untitled Session'));
  base.session_id = String(raw?.session_id || raw?.sessionId || base.session_id);
  base.version = String(raw?.version || PULSEGRID_ENGINE_VERSION);
  base.transport = {
    bpm: clamp(Number(raw?.transport?.bpm ?? raw?.bpm ?? 120), 20, 400),
    swing: clamp(Number(raw?.transport?.swing ?? raw?.swing ?? 0), 0, 80),
    time_signature: [
      Math.max(1, Math.round(Number(raw?.transport?.time_signature?.[0]) || 4)),
      Math.max(1, Math.round(Number(raw?.transport?.time_signature?.[1]) || 4)),
    ],
  };
  base.active_scene = clamp(Math.round(Number(raw?.active_scene ?? raw?.activeScene ?? 0)), 0, SCENES - 1);

  if(Array.isArray(raw?.assets)){
    base.assets=raw.assets.slice(0,4096).flatMap((asset:any)=>{
      try{return [normalizeAudioAsset(asset)]}catch{return []}
    });
  }

  if (Array.isArray(raw?.tracks)) {
    base.tracks = raw.tracks.slice(0, 32).map((track: any, trackIndex: number) => {
      const fallback = base.tracks[trackIndex] || defaultTrack(
        String(track?.id || 'track-' + String(trackIndex + 1)),
        String(track?.name || 'Track ' + String(trackIndex + 1)),
        track?.type === 'audio' || track?.type === 'drums' ? track.type : 'synth',
      );
      const id = String(track?.id || fallback.id);
      const type: PulseGridTrack['type'] =
        track?.type === 'audio' || track?.type === 'drums' ? track.type : 'synth';
      const clips=Array.from({ length: SCENES }, (_, scene) =>
        migrateClip(track?.clips?.[scene], `${id}-scene-${scene + 1}`),
      );
      if(type!=='audio') clips.forEach((clip)=>{clip.audio_asset_id=null});
      return {
        id,
        name: String(track?.name || fallback.name),
        type,
        volume: clamp(Number(track?.volume ?? fallback.volume), 0, 1),
        muted: Boolean(track?.muted),
        solo: Boolean(track?.solo),
        filterHz: clamp(Number(track?.filterHz ?? fallback.filterHz), 80, 19000),
        delayMix: clamp(Number(track?.delayMix ?? fallback.delayMix), 0, 0.65),
        delayTime: clamp(Number(track?.delayTime ?? fallback.delayTime), 0.02, 0.8),
        delayFeedback: clamp(Number(track?.delayFeedback ?? fallback.delayFeedback), 0, 0.78),
        clips,
      };
    });
  }

  const migratedAssetIds=new Set(base.assets.map((asset)=>asset.id));
  for(const track of base.tracks){
    for(const clip of track.clips){
      if(clip.audio_asset_id&&!migratedAssetIds.has(clip.audio_asset_id)) clip.audio_asset_id=null;
    }
  }

  if (Array.isArray(raw?.arrangement)) {
    base.arrangement = base.tracks.map((_, trackIndex) =>
      Array.from({ length: PULSEGRID_ARRANGEMENT_BARS }, (_, bar) => {
        const value = raw.arrangement?.[trackIndex]?.[bar];
        return Number.isInteger(value) && value >= 0 && value < SCENES ? value : null;
      }),
    );
  } else {
    base.arrangement = base.tracks.map(() => Array.from({ length: PULSEGRID_ARRANGEMENT_BARS }, () => null));
  }

  base.receipts = Array.isArray(raw?.receipts) ? raw.receipts.slice(-1000) : [];
  base.schema = PULSEGRID_SESSION_SCHEMA;
  base.version = PULSEGRID_ENGINE_VERSION;
  return base;
}

export function validatePulseGridSession(session: PulseGridSession) {
  const errors: string[] = [];
  if (session.schema !== PULSEGRID_SESSION_SCHEMA) errors.push('schema');
  if (!session.session_id) errors.push('session_id');
  if (!Number.isFinite(session.transport?.bpm) || session.transport.bpm < 20 || session.transport.bpm > 400) errors.push('transport.bpm');
  if (!Array.isArray(session.tracks) || session.tracks.length === 0) errors.push('tracks');
  if (!Array.isArray(session.assets)) errors.push('assets');
  if (!Array.isArray(session.arrangement) || session.arrangement.length !== session.tracks.length) {
    errors.push('arrangement');
  } else {
    session.arrangement.forEach((row, trackIndex) => {
      if (!Array.isArray(row) || row.length !== PULSEGRID_ARRANGEMENT_BARS) {
        errors.push(`arrangement.${trackIndex}.length`);
        return;
      }
      const clipCount = session.tracks[trackIndex]?.clips.length || 0;
      row.forEach((scene, bar) => {
        if (scene !== null && (!Number.isInteger(scene) || scene < 0 || scene >= clipCount)) {
          errors.push(`arrangement.${trackIndex}.${bar}`);
        }
      });
    });
  }

  const assetIds=new Set<string>();
  const assetById=new Map<string,PulseGridAudioAsset>();
  for(const asset of session.assets||[]){
    if(!asset.id||assetIds.has(asset.id)) errors.push('asset.id');
    assetIds.add(asset.id);
    assetById.set(asset.id,asset);
    if(!SHA256_HEX.test(asset.digest)||asset.id!==pulseGridAudioAssetId(asset.digest)) errors.push(`asset.${asset.id}.digest`);
    if(asset.kind!=='audio') errors.push(`asset.${asset.id}.kind`);
    if(!asset.mime_type) errors.push(`asset.${asset.id}.mime_type`);
    if(!Number.isInteger(asset.byte_length)||asset.byte_length<=0) errors.push(`asset.${asset.id}.byte_length`);
    if(asset.duration_sec<0) errors.push(`asset.${asset.id}.duration_sec`);
    if(asset.sample_rate<=0) errors.push(`asset.${asset.id}.sample_rate`);
    if(asset.channels<1||asset.channels>32) errors.push(`asset.${asset.id}.channels`);
    if(!asset.source_refs.length) errors.push(`asset.${asset.id}.source_refs`);
  }
  for(const asset of session.assets||[]){
    for(const parentId of asset.parent_asset_ids){
      if(!assetIds.has(parentId)) errors.push(`asset.${asset.id}.parent_missing`);
    }
  }

  for (const track of session.tracks || []) {
    if (!track.id) errors.push('track.id');
    for (const clip of track.clips || []) {
      const expectedSteps = clip.bars * PULSEGRID_STEPS_PER_BAR;
      if (!Number.isInteger(clip.bars) || clip.bars < 1 || clip.bars > PULSEGRID_MAX_CLIP_BARS) errors.push(`${track.id}.${clip.id}.bars`);
      if (clip.steps_per_bar !== PULSEGRID_STEPS_PER_BAR) errors.push(`${track.id}.${clip.id}.steps_per_bar`);
      if (clip.steps.length !== expectedSteps) errors.push(`${track.id}.${clip.id}.steps`);
      if(clip.provenance?.audio_playback_mode!==undefined &&
        !['loop','one_shot'].includes(String(clip.provenance.audio_playback_mode))) errors.push(`${track.id}.${clip.id}.audio_playback_mode`);
      if (clip.probabilities.length !== expectedSteps) errors.push(`${track.id}.${clip.id}.probabilities_length`);
      if (clip.microtiming.length !== expectedSteps) errors.push(`${track.id}.${clip.id}.microtiming_length`);
      if (clip.automation.volume.length !== expectedSteps) errors.push(`${track.id}.${clip.id}.automation.volume`);
      if (clip.automation.filter.length !== expectedSteps) errors.push(`${track.id}.${clip.id}.automation.filter`);
      if (clip.probabilities.some((value) => value < 0 || value > 1)) errors.push(`${track.id}.${clip.id}.probabilities`);
      if(clip.provenance?.foundry_piano_patch){
        if(track.type!=='synth')errors.push(`${track.id}.${clip.id}.foundry_patch_type`);
        else{
          try{
            const patch=clip.provenance.foundry_piano_patch as FoundryInstrumentPatch;
            validateFoundryPatch(patch,session.assets);
            for(const note of clip.notes)selectFoundrySample(patch,note.pitch,note.velocity);
          }catch(error){errors.push(`${track.id}.${clip.id}.foundry_patch: ${error instanceof Error?error.message:String(error)}`)}
        }
      }
      if(clip.provenance?.foundry_piano_pedal!==undefined){
        if(track.type!=='synth')errors.push(`${track.id}.${clip.id}.foundry_pedal_track_type`);
        else try{validateFoundryPedalEvents(clip.provenance.foundry_piano_pedal as FoundryPedalEvent[],clip.steps.length)}
          catch(error){errors.push(`${track.id}.${clip.id}.foundry_pedal_invalid: ${error instanceof Error?error.message:String(error)}`)}
      }
      if(clip.audio_asset_id){
        const asset=assetById.get(clip.audio_asset_id);
        if(track.type!=='audio') errors.push(`${track.id}.${clip.id}.audio_asset_track_type`);
        if(!asset) errors.push(`${track.id}.${clip.id}.audio_asset_missing`);
        else if(asset.rights==='restricted') errors.push(`${track.id}.${clip.id}.audio_asset_restricted`);
      }
      const noteIds = new Set<string>();
      for (const note of clip.notes) {
        if (!note.id || noteIds.has(note.id)) errors.push(`${track.id}.${clip.id}.note_id`);
        noteIds.add(note.id);
        if (note.pitch < 0 || note.pitch > 127) errors.push(`${track.id}.${clip.id}.${note.id}.pitch`);
        if (note.start < 0 || note.start >= expectedSteps) errors.push(`${track.id}.${clip.id}.${note.id}.start`);
        if (note.length <= 0 || note.start + note.length > expectedSteps + 1e-9) errors.push(`${track.id}.${clip.id}.${note.id}.length`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

function cloneSession(session: PulseGridSession): PulseGridSession {
  return structuredClone(session);
}

function sessionStateSnapshot(session: PulseGridSession) {
  return {
    project_name: session.project_name,
    transport: structuredClone(session.transport),
    active_scene: session.active_scene,
    assets: structuredClone(session.assets),
    tracks: structuredClone(session.tracks),
    arrangement: structuredClone(session.arrangement),
  };
}

function restoreSessionState(session: PulseGridSession, snapshot: any) {
  session.project_name = String(snapshot?.project_name || session.project_name);
  session.transport = structuredClone(snapshot?.transport || session.transport);
  session.active_scene = Number.isInteger(snapshot?.active_scene) ? snapshot.active_scene : session.active_scene;
  session.assets = structuredClone(snapshot?.assets || session.assets);
  session.tracks = structuredClone(snapshot?.tracks || session.tracks);
  session.arrangement = structuredClone(snapshot?.arrangement || session.arrangement);
}

function getTrack(session: PulseGridSession, trackId: string) {
  const track = session.tracks.find((candidate) => candidate.id === trackId);
  if (!track) throw new Error('Unknown PulseGrid track: ' + trackId);
  return track;
}

function getClip(session: PulseGridSession, trackId: string, scene: number) {
  const track = getTrack(session, trackId);
  const clip = track.clips[scene];
  if (!clip) throw new Error('Unknown PulseGrid scene: ' + String(scene));
  return { track, clip };
}

function resizeClip(clip: PulseGridClip, barsInput: number) {
  const bars = clamp(Math.round(barsInput), 1, PULSEGRID_MAX_CLIP_BARS);
  const length = bars * PULSEGRID_STEPS_PER_BAR;
  clip.bars = bars;
  clip.steps_per_bar = PULSEGRID_STEPS_PER_BAR;
  clip.steps = vector(clip.steps, 0, length).map((value) => clamp(value, 0, 1));
  clip.probabilities = vector(clip.probabilities, 1, length).map((value) => clamp(value, 0, 1));
  clip.microtiming = vector(clip.microtiming, 0, length).map((value) => clamp(value, -1000, 1000));
  clip.automation.volume = vector(clip.automation.volume, 1, length).map((value) => clamp(value, 0, 1));
  clip.automation.filter = vector(clip.automation.filter, 1, length).map((value) => clamp(value, 0, 1));
  if(Array.isArray(clip.provenance?.foundry_piano_pedal)){
    clip.provenance={...clip.provenance,
      foundry_piano_pedal:clip.provenance.foundry_piano_pedal.filter((event:any)=>event.step<length)};
  }
  clip.notes = clip.notes
    .filter((note) => note.start < length)
    .map((note) => ({ ...note, length: clamp(note.length, 0.01, Math.max(0.01, length - note.start)) }));
}

function findNote(clip: PulseGridClip, noteId: string) {
  const index = clip.notes.findIndex((note) => note.id === noteId);
  if (index < 0) throw new Error('Unknown PulseGrid note: ' + noteId);
  return { index, note: clip.notes[index] };
}

export function applyPulseGridOperation(
  source: PulseGridSession,
  operation: PulseGridOperation,
  actor: PulseGridActor = 'human',
) {
  const session = cloneSession(source);
  let before: unknown;
  let after: unknown;
  let targets: string[] = [];

  if (operation.type === 'transport.set_tempo') {
    before = session.transport.bpm;
    session.transport.bpm = clamp(operation.bpm, 20, 400);
    after = session.transport.bpm;
    targets = ['transport.bpm'];
  } else if (operation.type === 'transport.set_swing') {
    before = session.transport.swing;
    session.transport.swing = clamp(operation.swing, 0, 80);
    after = session.transport.swing;
    targets = ['transport.swing'];
  } else if (operation.type === 'track.set_filter') {
    const track = getTrack(session, operation.track_id);
    before = track.filterHz;
    track.filterHz = clamp(operation.filter_hz, 80, 19000);
    after = track.filterHz;
    targets = [`track:${track.id}.filterHz`];
  } else if (operation.type === 'track.set_delay_mix') {
    const track = getTrack(session, operation.track_id);
    before = track.delayMix;
    track.delayMix = clamp(operation.mix, 0, 0.65);
    after = track.delayMix;
    targets = [`track:${track.id}.delayMix`];
  } else if (operation.type === 'clip.set_bars') {
    const { clip } = getClip(session, operation.track_id, operation.scene);
    before = structuredClone(clip);
    resizeClip(clip, operation.bars);
    after = structuredClone(clip);
    targets = [`clip:${clip.id}`];
  } else if (operation.type === 'clip.set_step') {
    const { clip } = getClip(session, operation.track_id, operation.scene);
    if (operation.step < 0 || operation.step >= clip.steps.length) throw new Error('PulseGrid step is out of range.');
    before = clip.steps[operation.step];
    clip.steps[operation.step] = clamp(operation.velocity, 0, 1);
    after = clip.steps[operation.step];
    targets = [`clip:${clip.id}.steps[${operation.step}]`];
  } else if (operation.type === 'clip.set_step_expression') {
    const { clip } = getClip(session, operation.track_id, operation.scene);
    if (operation.step < 0 || operation.step >= clip.steps.length) {
      throw new Error('PulseGrid step expression index is out of range.');
    }
    if (
      operation.velocity === undefined &&
      operation.probability === undefined &&
      operation.microtiming === undefined
    ) {
      throw new Error('PulseGrid step expression requires at least one value.');
    }
    before = {
      velocity: clip.steps[operation.step],
      probability: clip.probabilities[operation.step],
      microtiming: clip.microtiming[operation.step],
    };
    if (operation.velocity !== undefined) clip.steps[operation.step] = clamp(Number(operation.velocity), 0, 1);
    if (operation.probability !== undefined) clip.probabilities[operation.step] = clamp(Number(operation.probability), 0, 1);
    if (operation.microtiming !== undefined) clip.microtiming[operation.step] = clamp(Number(operation.microtiming), -1000, 1000);
    after = {
      velocity: clip.steps[operation.step],
      probability: clip.probabilities[operation.step],
      microtiming: clip.microtiming[operation.step],
    };
    targets = [`clip:${clip.id}.step_expression[${operation.step}]`];
  } else if (operation.type === 'clip.set_automation_point') {
    const { clip } = getClip(session, operation.track_id, operation.scene);
    if (operation.step < 0 || operation.step >= clip.steps.length) {
      throw new Error('PulseGrid automation step is out of range.');
    }
    const lane = clip.automation[operation.parameter];
    before = lane[operation.step];
    lane[operation.step] = clamp(Number(operation.value), 0, 1);
    after = lane[operation.step];
    targets = [`clip:${clip.id}.automation.${operation.parameter}[${operation.step}]`];
  } else if (operation.type === 'arrangement.set_slot') {
    const trackIndex = session.tracks.findIndex((candidate) => candidate.id === operation.track_id);
    if (trackIndex < 0) throw new Error('Unknown PulseGrid track: ' + operation.track_id);
    if (!Number.isInteger(operation.bar) || operation.bar < 0 || operation.bar >= PULSEGRID_ARRANGEMENT_BARS) {
      throw new Error('PulseGrid arrangement bar is out of range.');
    }
    const track = session.tracks[trackIndex];
    if (
      operation.scene !== null &&
      (!Number.isInteger(operation.scene) || operation.scene < 0 || operation.scene >= track.clips.length)
    ) {
      throw new Error('PulseGrid arrangement scene is out of range.');
    }
    const row = session.arrangement[trackIndex];
    if (!Array.isArray(row) || row.length !== PULSEGRID_ARRANGEMENT_BARS) {
      throw new Error('PulseGrid arrangement row is invalid.');
    }
    before = row[operation.bar] ?? null;
    row[operation.bar] = operation.scene;
    after = row[operation.bar];
    targets = [`arrangement:${track.id}.bar:${operation.bar}`];
  } else if (operation.type === 'clip.fork_variation') {
    const track = getTrack(session, operation.track_id);
    const sourceClip = track.clips[operation.source_scene];
    const destinationClip = track.clips[operation.destination_scene];
    if (!sourceClip) throw new Error('Unknown PulseGrid source scene: ' + String(operation.source_scene));
    if (!destinationClip) throw new Error('Unknown PulseGrid destination scene: ' + String(operation.destination_scene));
    if (operation.source_scene === operation.destination_scene) throw new Error('PulseGrid variation fork requires a different destination scene.');
    before = structuredClone(destinationClip);
    const fork = structuredClone(sourceClip);
    fork.id = randomId();
    fork.name = String(operation.name || sourceClip.name + ' Variation').trim().slice(0, 120) || sourceClip.name + ' Variation';
    fork.provenance = {
      ...fork.provenance,
      kind: 'variation',
      parent_clip_id: sourceClip.id,
      parent_scene: operation.source_scene,
      forked_by: actor,
    };
    track.clips[operation.destination_scene] = fork;
    after = structuredClone(fork);
    targets = [`track:${track.id}.scene:${operation.destination_scene}`];
  } else if (operation.type === 'clip.set_foundry_piano_patch') {
    const {track,clip}=getClip(session,operation.track_id,operation.scene);
    if(track.type!=='synth')throw new Error('Foundry piano patches require a synth instrument track.');
    if(operation.patch!==null){
      validateFoundryPatch(operation.patch,session.assets);
      for(const note of clip.notes)selectFoundrySample(operation.patch,note.pitch,note.velocity);
    }
    before=structuredClone(clip.provenance?.foundry_piano_patch??null);
    clip.provenance={...clip.provenance};
    if(operation.patch===null)delete clip.provenance.foundry_piano_patch;
    else clip.provenance.foundry_piano_patch=structuredClone(operation.patch);
    after=structuredClone(operation.patch);
    targets=[`clip:${clip.id}.foundry_piano_patch`];
  } else if (operation.type === 'clip.set_foundry_piano_pedal') {
    const {track,clip}=getClip(session,operation.track_id,operation.scene);
    if(track.type!=='synth')throw new Error('Foundry piano pedal requires a synth track.');
    if(operation.events!==null)validateFoundryPedalEvents(operation.events,clip.steps.length);
    before=structuredClone(clip.provenance?.foundry_piano_pedal??null);
    clip.provenance={...clip.provenance};
    if(operation.events===null)delete clip.provenance.foundry_piano_pedal;
    else clip.provenance.foundry_piano_pedal=structuredClone(operation.events);
    after=structuredClone(operation.events);
    targets=[`clip:${clip.id}.foundry_piano_pedal`];
  } else if (operation.type === 'clip.set_audio_playback_mode') {
    const {track,clip}=getClip(session,operation.track_id,operation.scene);
    if(track.type!=='audio')throw new Error('Audio playback modes apply only to audio tracks.');
    if(!['loop','one_shot'].includes(operation.mode))throw new Error('Unsupported audio playback mode.');
    before=clip.provenance?.audio_playback_mode??null;
    clip.provenance={...clip.provenance,audio_playback_mode:operation.mode};
    after=operation.mode;
    targets=[`clip:${clip.id}.audio_playback_mode`];
  } else if (operation.type === 'asset.register_audio') {
    const incoming=normalizeAudioAsset(operation.asset);
    const index=session.assets.findIndex((asset)=>asset.id===incoming.id);
    const existing=index>=0?session.assets[index]:null;
    before=existing?structuredClone(existing):null;
    if(existing){
      session.assets[index]={
        ...incoming,
        created_at:existing.created_at,
        source_name:existing.source_name||incoming.source_name,
        source_refs:[...new Set([...existing.source_refs,...incoming.source_refs])],
        parent_asset_ids:[...new Set([...existing.parent_asset_ids,...incoming.parent_asset_ids])],
        rights:conservativeRights(existing.rights,incoming.rights),
      };
      after=structuredClone(session.assets[index]);
    }else{
      session.assets.push(incoming);
      after=structuredClone(incoming);
    }
    targets=[`asset:${incoming.id}`];
  } else if (operation.type === 'clip.attach_audio_asset') {
    const {track,clip}=getClip(session,operation.track_id,operation.scene);
    if(track.type!=='audio') throw new Error('PulseGrid audio assets can only attach to audio tracks.');
    if(operation.asset_id){
      const asset=session.assets.find((candidate)=>candidate.id===operation.asset_id);
      if(!asset) throw new Error('Unknown PulseGrid audio asset: '+operation.asset_id);
      if(asset.rights==='restricted') throw new Error('Restricted PulseGrid audio asset cannot be attached.');
    }
    before=clip.audio_asset_id;
    clip.audio_asset_id=operation.asset_id;
    after=clip.audio_asset_id;
    targets=[`clip:${clip.id}.audio_asset_id`];
  } else if (operation.type === 'note.add') {
    const { clip } = getClip(session, operation.track_id, operation.scene);
    const note = normalizeNote({ ...operation.note, id: operation.note.id || randomId() }, clip.id, clip.notes.length, clip.steps.length);
    if (clip.notes.some((candidate) => candidate.id === note.id)) throw new Error('PulseGrid note ID already exists: ' + note.id);
    before = null;
    clip.notes.push(note);
    after = structuredClone(note);
    targets = [`clip:${clip.id}.note:${note.id}`];
  } else if (operation.type === 'note.move') {
    const { clip } = getClip(session, operation.track_id, operation.scene);
    const { note } = findNote(clip, operation.note_id);
    before = structuredClone(note);
    note.pitch = clamp(Math.round(operation.pitch), 0, 127);
    note.start = clamp(Math.round(operation.start), 0, Math.max(0, clip.steps.length - 1));
    note.length = clamp(note.length, 0.01, Math.max(0.01, clip.steps.length - note.start));
    after = structuredClone(note);
    targets = [`clip:${clip.id}.note:${note.id}`];
  } else if (operation.type === 'note.resize') {
    const { clip } = getClip(session, operation.track_id, operation.scene);
    const { note } = findNote(clip, operation.note_id);
    before = structuredClone(note);
    note.length = clamp(Number(operation.length), 0.01, Math.max(0.01, clip.steps.length - note.start));
    after = structuredClone(note);
    targets = [`clip:${clip.id}.note:${note.id}`];
  } else if (operation.type === 'note.set_expression') {
    const { clip } = getClip(session, operation.track_id, operation.scene);
    const { note } = findNote(clip, operation.note_id);
    if (
      operation.velocity === undefined &&
      operation.probability === undefined &&
      operation.microtiming === undefined
    ) {
      throw new Error('PulseGrid note expression requires at least one value.');
    }
    before = structuredClone(note);
    if (operation.velocity !== undefined) note.velocity = clamp(Number(operation.velocity), 0, 1);
    if (operation.probability !== undefined) note.probability = clamp(Number(operation.probability), 0, 1);
    if (operation.microtiming !== undefined) note.microtiming = clamp(Number(operation.microtiming), -1000, 1000);
    after = structuredClone(note);
    targets = [`clip:${clip.id}.note:${note.id}.expression`];
  } else {
    const { clip } = getClip(session, operation.track_id, operation.scene);
    const { index, note } = findNote(clip, operation.note_id);
    before = structuredClone(note);
    clip.notes.splice(index, 1);
    after = null;
    targets = [`clip:${clip.id}.note:${note.id}`];
  }

  const receipt: PulseGridReceipt = {
    id: randomId(),
    timestamp: new Date().toISOString(),
    actor,
    operation: operation.type,
    targets,
    before,
    after,
    reversible: true,
    request: structuredClone(operation),
    undo_of: null,
  };
  session.receipts.push(receipt);
  const validation = validatePulseGridSession(session);
  if (!validation.ok) throw new Error('PulseGrid operation produced invalid session: ' + validation.errors.join(', '));
  return { session, receipt };
}


export function applyPulseGridTransaction(
  source: PulseGridSession,
  input: PulseGridTransactionInput,
  actor: PulseGridActor = 'agent',
) {
  const intent = String(input?.intent || '').trim();
  const operations = Array.isArray(input?.operations) ? input.operations : [];
  if (!intent) throw new Error('PulseGrid transaction intent is required.');
  if (!operations.length) throw new Error('PulseGrid transaction requires at least one operation.');
  if (operations.length > 128) throw new Error('PulseGrid transaction exceeds the 128-operation safety limit.');

  const transactionId = String(input.transaction_id || randomId());
  const before = sessionStateSnapshot(source);
  let working = cloneSession(source);
  const childReceipts: PulseGridReceipt[] = [];

  for (const operation of operations) {
    const result = applyPulseGridOperation(working, operation, actor);
    result.receipt.transaction_id = transactionId;
    result.receipt.intent = intent;
    working = result.session;
    childReceipts.push(result.receipt);
  }

  const after = sessionStateSnapshot(working);
  const receipt: PulseGridReceipt = {
    id: randomId(),
    timestamp: new Date().toISOString(),
    actor,
    operation: 'transaction.apply',
    targets: [...new Set(childReceipts.flatMap((child) => child.targets))],
    before,
    after,
    reversible: true,
    request: {
      type: 'transaction.apply',
      transaction_id: transactionId,
      intent,
      operations: structuredClone(operations),
    },
    undo_of: null,
    transaction_id: transactionId,
    child_receipt_ids: childReceipts.map((child) => child.id),
    intent,
  };
  working.receipts.push(receipt);

  const validation = validatePulseGridSession(working);
  if (!validation.ok) {
    throw new Error('PulseGrid transaction produced invalid session: ' + validation.errors.join(', '));
  }

  return { session: working, receipt, child_receipts: childReceipts };
}


export function undoPulseGridReceipt(
  source: PulseGridSession,
  receiptId: string,
  actor: PulseGridActor = 'human',
) {
  const originalReceipt = source.receipts.find((candidate) => candidate.id === receiptId);
  if (!originalReceipt) throw new Error('Unknown PulseGrid receipt: ' + receiptId);
  if (!originalReceipt.reversible) throw new Error('PulseGrid receipt is not reversible: ' + receiptId);
  if (!originalReceipt.request) throw new Error('PulseGrid receipt predates executable undo metadata: ' + receiptId);

  const session = cloneSession(source);
  const operation = originalReceipt.request;

  if (operation.type === 'transaction.apply') {
    restoreSessionState(session, originalReceipt.before);
  } else if (operation.type === 'transport.set_tempo') {
    session.transport.bpm = Number(originalReceipt.before);
  } else if (operation.type === 'transport.set_swing') {
    session.transport.swing = Number(originalReceipt.before);
  } else if (operation.type === 'track.set_filter') {
    getTrack(session, operation.track_id).filterHz = Number(originalReceipt.before);
  } else if (operation.type === 'track.set_delay_mix') {
    getTrack(session, operation.track_id).delayMix = Number(originalReceipt.before);
  } else if (operation.type === 'clip.set_bars') {
    const track = getTrack(session, operation.track_id);
    if (!track.clips[operation.scene]) throw new Error('Unknown PulseGrid scene: ' + String(operation.scene));
    track.clips[operation.scene] = structuredClone(originalReceipt.before as PulseGridClip);
  } else if (operation.type === 'clip.set_step') {
    const { clip } = getClip(session, operation.track_id, operation.scene);
    if (operation.step < 0 || operation.step >= clip.steps.length) throw new Error('PulseGrid undo step is out of range.');
    clip.steps[operation.step] = Number(originalReceipt.before);
  } else if (operation.type === 'clip.set_step_expression') {
    const { clip } = getClip(session, operation.track_id, operation.scene);
    if (operation.step < 0 || operation.step >= clip.steps.length) throw new Error('PulseGrid undo step expression index is out of range.');
    const restored = originalReceipt.before as {velocity:number;probability:number;microtiming:number};
    clip.steps[operation.step] = Number(restored.velocity);
    clip.probabilities[operation.step] = Number(restored.probability);
    clip.microtiming[operation.step] = Number(restored.microtiming);
  } else if (operation.type === 'clip.set_automation_point') {
    const { clip } = getClip(session, operation.track_id, operation.scene);
    if (operation.step < 0 || operation.step >= clip.steps.length) throw new Error('PulseGrid undo automation step is out of range.');
    clip.automation[operation.parameter][operation.step] = Number(originalReceipt.before);
  } else if (operation.type === 'arrangement.set_slot') {
    const trackIndex = session.tracks.findIndex((candidate) => candidate.id === operation.track_id);
    if (trackIndex < 0) throw new Error('Unknown PulseGrid track: ' + operation.track_id);
    if (!Number.isInteger(operation.bar) || operation.bar < 0 || operation.bar >= PULSEGRID_ARRANGEMENT_BARS) {
      throw new Error('PulseGrid undo arrangement bar is out of range.');
    }
    const row = session.arrangement[trackIndex];
    if (!Array.isArray(row) || row.length !== PULSEGRID_ARRANGEMENT_BARS) {
      throw new Error('PulseGrid arrangement row is invalid.');
    }
    const restored = originalReceipt.before;
    row[operation.bar] = restored === null ? null : Number(restored);
  } else if (operation.type === 'clip.fork_variation') {
    const track = getTrack(session, operation.track_id);
    if (!track.clips[operation.destination_scene]) throw new Error('Unknown PulseGrid destination scene: ' + String(operation.destination_scene));
    track.clips[operation.destination_scene] = structuredClone(originalReceipt.before as PulseGridClip);
  } else if(operation.type==='clip.set_foundry_piano_patch'){
    const {clip}=getClip(session,operation.track_id,operation.scene);
    clip.provenance={...clip.provenance};
    if(originalReceipt.before===null)delete clip.provenance.foundry_piano_patch;
    else clip.provenance.foundry_piano_patch=structuredClone(originalReceipt.before);
  } else if(operation.type==='clip.set_foundry_piano_pedal'){
    const {clip}=getClip(session,operation.track_id,operation.scene);
    clip.provenance={...clip.provenance};
    if(originalReceipt.before===null)delete clip.provenance.foundry_piano_pedal;
    else clip.provenance.foundry_piano_pedal=structuredClone(originalReceipt.before);
  } else if(operation.type==='clip.set_audio_playback_mode'){
    const {clip}=getClip(session,operation.track_id,operation.scene);
    const oldMode=originalReceipt.before as string|null;
    if(oldMode===null || oldMode===undefined){
      const restored={...clip.provenance};
      delete restored.audio_playback_mode;
      clip.provenance=restored;
    }else{
      clip.provenance={...clip.provenance,audio_playback_mode:oldMode};
    }
  } else if(operation.type==='asset.register_audio'){
    const registered=originalReceipt.after as PulseGridAudioAsset|null;
    const prior=originalReceipt.before as PulseGridAudioAsset|null;
    if(!registered?.id) throw new Error('PulseGrid asset receipt is missing registered asset identity.');
    const index=session.assets.findIndex((asset)=>asset.id===registered.id);
    if(prior){
      if(index>=0) session.assets[index]=structuredClone(prior);
      else session.assets.push(structuredClone(prior));
    }else if(index>=0){
      const stillReferenced=session.tracks.some((track)=>track.clips.some((clip)=>clip.audio_asset_id===registered.id));
      if(stillReferenced) throw new Error('PulseGrid audio asset cannot be undone while still attached.');
      session.assets.splice(index,1);
    }
  } else if(operation.type==='clip.attach_audio_asset'){
    const {clip}=getClip(session,operation.track_id,operation.scene);
    clip.audio_asset_id=(originalReceipt.before as string|null)||null;
  } else if (operation.type === 'note.add') {
    const { clip } = getClip(session, operation.track_id, operation.scene);
    const created = originalReceipt.after as PulseGridNote | null;
    if (!created?.id) throw new Error('PulseGrid note-add receipt has no created note identity.');
    const existing = clip.notes.findIndex((note) => note.id === created.id);
    if (existing < 0) throw new Error('PulseGrid created note no longer exists: ' + created.id);
    clip.notes.splice(existing, 1);
  } else if (operation.type === 'note.move' || operation.type === 'note.resize' || operation.type === 'note.set_expression') {
    const { clip } = getClip(session, operation.track_id, operation.scene);
    const restored = structuredClone(originalReceipt.before as PulseGridNote);
    const { index } = findNote(clip, operation.note_id);
    clip.notes[index] = restored;
  } else if (operation.type === 'note.delete') {
    const { clip } = getClip(session, operation.track_id, operation.scene);
    const restored = structuredClone(originalReceipt.before as PulseGridNote);
    if (clip.notes.some((note) => note.id === restored.id)) {
      throw new Error('PulseGrid deleted note already exists: ' + restored.id);
    }
    clip.notes.push(restored);
    clip.notes.sort((a, b) => a.start - b.start || a.pitch - b.pitch || a.id.localeCompare(b.id));
  }

  const validation = validatePulseGridSession(session);
  if (!validation.ok) {
    throw new Error('PulseGrid undo produced invalid session: ' + validation.errors.join(', '));
  }

  const undoReceipt: PulseGridReceipt = {
    id: randomId(),
    timestamp: new Date().toISOString(),
    actor,
    operation: 'operation.undo',
    targets: [...originalReceipt.targets],
    before: structuredClone(originalReceipt.after),
    after: structuredClone(originalReceipt.before),
    reversible: false,
    request: null,
    undo_of: originalReceipt.id,
    transaction_id: originalReceipt.transaction_id || null,
    child_receipt_ids: null,
    intent: originalReceipt.intent || null,
  };
  session.receipts.push(undoReceipt);
  return { session, receipt: undoReceipt };
}
