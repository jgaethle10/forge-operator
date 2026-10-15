/**
 * EIX-001: presentation-only bridge for already-produced Evercraft World Engine
 * render frames. The native engine owns time/positions; this module cannot
 * invent motion, publish an experience, or authorize a customer transaction.
 *
 * Source evidence and movement are intentionally separate: a sourced sensor
 * projected into a modeled world is NOT observed 3D motion.
 */
const FRAME_SCHEMA = 'evercraft.world-engine.render-frame.v1';
const EXPERIENCE_SCHEMA = 'evercraft.experience.world-replay.v1';
const EVIDENCE_STATES = new Set(['observed', 'public', 'licensed', 'inferred', 'modeled', 'unknown']);
const clean = (value) => String(value ?? '').trim();
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const fail = (message) => { throw new Error('eix_' + message); };
const clone = (value) => structuredClone(value);

function normalizeSource(entity) {
  const props = entity.properties && typeof entity.properties === 'object' ? entity.properties : {};
  const requested = clean(props.evidence_state).toLowerCase();
  const sourceRefs = Array.isArray(props.source_refs)
    ? [...new Set(props.source_refs.map(clean).filter(Boolean))].sort()
    : [];
  // No unsourced OBSERVED / PUBLIC / LICENSED claim can survive this bridge.
  const evidenceState = EVIDENCE_STATES.has(requested) && requested !== 'unknown'
    ? (['observed', 'public', 'licensed'].includes(requested) && sourceRefs.length === 0 ? 'unknown' : requested)
    : (requested === 'modeled' || requested === 'inferred' ? requested : 'unknown');
  return {
    evidence_state: evidenceState,
    source_refs: sourceRefs,
    source_snapshot_id: clean(props.source_snapshot_id) || null,
    // WORLD motion stays modeled even when the source datum was observed.
    motion_state: 'modeled',
  };
}

// A small, explicit public-inspection allowlist. Never forward arbitrary
// customer, operator, or credential fields from engine properties.
function normalizeInspection(properties) {
  const safe = {};
  const allowed = ['machine_state','zone','payload_tons','commanded_speed_mps','controller_hold'];
  for (const key of allowed) {
    const value = properties?.[key];
    if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)) || (typeof value === 'string' && value.length <= 100)) {
      safe[key] = value;
    }
  }
  return safe;
}

function normalizeEntity(entity) {
  if (!entity || !clean(entity.id)) fail('entity_id_missing');
  const position = entity.transform?.position;
  if (!position || !['x', 'y', 'z'].every(axis => finite(position[axis]))) {
    fail('invalid_position:' + clean(entity.id));
  }
  const tags = Array.isArray(entity.tags) ? [...new Set(entity.tags.map(clean).filter(Boolean))].sort() : [];
  const source = normalizeSource(entity);
  return {
    id: clean(entity.id),
    label: clean(entity.properties?.display_name) || clean(entity.properties?.label) || clean(entity.id),
    world_position_m: { x: position.x, y: position.y, z: position.z },
    tags,
    source,
    inspection: normalizeInspection(entity.properties),
    animation_state: clean(entity.animation?.stateId) || null,
    // Hit testing and accessibility use the same stable entity identity.
    inspect_id: clean(entity.id),
  };
}

function normalizeFrame(frame, worldId) {
  if (frame?.schema !== FRAME_SCHEMA) fail('frame_schema_invalid');
  if (clean(frame.worldId) !== worldId) fail('world_id_mismatch');
  if (!Number.isInteger(frame.tick) || frame.tick < 0 || !finite(frame.timeSec) || frame.timeSec < 0) {
    fail('frame_time_invalid');
  }
  if (!Array.isArray(frame.entities)) fail('entities_missing');
  const entities = frame.entities.map(normalizeEntity).sort((a,b)=>a.id.localeCompare(b.id));
  if (new Set(entities.map(e=>e.id)).size !== entities.length) fail('duplicate_entity_id');
  const visual = frame.visual;
  if (visual && (visual.schema !== 'evercraft.world-engine.visual-frame.v1' ||
    visual.worldId !== worldId || visual.tick !== frame.tick || !clean(visual.digest))) {
    fail('visual_lineage_invalid');
  }
  return {
    tick: frame.tick,
    time_ms: Math.round(frame.timeSec * 1000),
    camera_id: clean(frame.cameraId) || null,
    render_mode: visual ? 'world_engine_visual_frame' : 'spatial_inspection_only',
    visual_digest: visual?.digest || null,
    entities,
  };
}

/**
 * Only authored teaching cues, never auto-generated scientific claims.
 * A cue can explain an example but cannot reclassify evidence or certify output.
 */
/**
 * TypeScript consumers import this module directly from the World Engine.
 * Make the full options contract explicit so tsc does not infer a defaults-only
 * shape and reject native frames/world IDs during Forge's source check.
 * @param {{world_id?: string, frames: any[], teaching_cues?: any[], title?: string}} [options]
 */
export function buildEixWorldReplay({world_id, frames, teaching_cues = [], title = 'World replay'} = {}) {
  if (!Array.isArray(frames) || frames.length === 0) fail('frames_missing');
  const worldId = clean(world_id || frames?.[0]?.worldId);
  if (!worldId) fail('world_id_missing');
  if (frames.length > 36000) fail('frame_budget_exceeded');
  const samples = frames.map(frame=>normalizeFrame(frame, worldId));
  for(let i=1;i<samples.length;i++){
    if(samples[i].tick <= samples[i-1].tick || samples[i].time_ms <= samples[i-1].time_ms) {
      fail('frames_not_monotonic');
    }
  }
  const cues = teaching_cues.map(cue=>{
    if (!cue || !Number.isInteger(cue.tick) || cue.tick < samples[0].tick || cue.tick > samples.at(-1).tick) {
      fail('cue_tick_out_of_bounds');
    }
    const text=clean(cue.text);
    if (!text) fail('cue_text_missing');
    const sourceRefs=Array.isArray(cue.source_refs) ? [...new Set(cue.source_refs.map(clean).filter(Boolean))].sort() : [];
    const evidenceState=clean(cue.evidence_state).toLowerCase() || 'modeled';
    if(!EVIDENCE_STATES.has(evidenceState)) fail('cue_evidence_invalid');
    if(['observed','public','licensed'].includes(evidenceState) && sourceRefs.length===0) fail('cue_source_missing');
    return {tick:cue.tick,text,source_refs:sourceRefs,evidence_state:evidenceState};
  }).sort((a,b)=>a.tick-b.tick||a.text.localeCompare(b.text));
  return {
    schema: EXPERIENCE_SCHEMA,
    world_id: worldId,
    title: clean(title) || 'World replay',
    // Not a verified real-world capture or an authoritative prediction.
    representation_state: 'modeled_world_replay',
    evidence_policy: 'entity_data_state_separate_from_motion_state',
    release_authority: false,
    payment_authority: false,
    delivery_authority: false,
    source_frame_schema: FRAME_SCHEMA,
    frame_count: samples.length,
    start_tick: samples[0].tick,
    end_tick: samples.at(-1).tick,
    frames: samples,
    teaching_cues: cues,
  };
}

/** Seek selects an exact supplied sample; it never fabricates an interpolated frame. */
export function seekEixWorldReplay(replay, timeMs) {
  if (replay?.schema !== EXPERIENCE_SCHEMA) fail('replay_schema_invalid');
  if (!finite(timeMs)) fail('seek_time_invalid');
  const frames = replay.frames;
  if (!Array.isArray(frames) || frames.length === 0) fail('frames_missing');
  let lo=0, hi=frames.length-1, chosen=0;
  while(lo<=hi){
    const mid=(lo+hi) >>> 1;
    if(frames[mid].time_ms<=timeMs){chosen=mid;lo=mid+1;}else{hi=mid-1;}
  }
  const frame=frames[chosen];
  const cues=(replay.teaching_cues||[]).filter(cue=>cue.tick<=frame.tick);
  return clone({frame, latest_cue:cues.at(-1)||null, sample_is_exact: frame.time_ms===timeMs});
}

export function inspectEixWorldEntity(replay, timeMs, entityId) {
  const selection=seekEixWorldReplay(replay,timeMs);
  const entity=selection.frame.entities.find(item=>item.id===clean(entityId));
  return entity ? clone({world_id:replay.world_id,tick:selection.frame.tick,entity}) : null;
}
