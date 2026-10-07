const ROLES=new Set([
  'engine_architect',
  'determinism_guard',
  'simulation_guard',
  'physics_guard',
  'ecs_guard',
  'scene_streaming_guard',
  'animation_guard',
  'navigation_guard',
  'visual_scene_guard',
  'audio_scene_guard',
  'replication_guard',
  'webgpu_guard',
  'webgpu_device_guard',
  'texture_residency_guard',
  'reference_frame_guard',
  'normal_map_guard',
  'studio_edit_guard',
  'runtime_migration_guard',
  'fallen_bridge_guard',
  'worldstate_bridge_guard',
  'provenance_guard',
  'runtime_guard'
]);

function worldFrom(item){
  return item?.raw?.world || item?.world || item?.raw || {};
}

function evaluate(role,world){
  const entities=Array.isArray(world.entities)?world.entities:[];
  const dynamic=entities.filter(entity=>entity?.rigidBody);
  const ids=entities.map(entity=>entity?.id).filter(Boolean);
  const duplicates=ids.filter((id,index)=>ids.indexOf(id)!==index);

  if(role==='engine_architect'){
    return {
      category:'architecture',
      directives:[
        'Keep the canonical world definition independent from any renderer or external game engine.',
        'Make editor, runtime, film previz and simulation clients consume the same world identity.',
        'Add capabilities through versioned components and adapters rather than provider-specific state.'
      ],
      findings:[
        world?.schema==='evercraft.world-engine.world.v1'?null:'canonical_schema_missing',
        entities.length?null:'world_has_no_entities'
      ].filter(Boolean)
    };
  }

  if(role==='determinism_guard'){
    return {
      category:'determinism',
      directives:[
        'Use fixed timestep simulation for canonical receipts.',
        'Sort entity and input application order before state mutation.',
        'Bind replay to world-definition and final-snapshot digests.'
      ],
      findings:[
        Number.isFinite(Number(world.tickRateHz))?null:'tick_rate_missing',
        world?.id?null:'world_id_missing'
      ].filter(Boolean)
    };
  }

  if(role==='simulation_guard'){
    return {
      category:'simulation',
      directives:[
        'Separate simulation truth from render interpolation.',
        'Record external inputs by tick so a run can be reproduced.',
        'Never let visual frame rate silently become simulation time.'
      ],
      findings:dynamic.length?[]:['no_dynamic_entities_in_fixture']
    };
  }

  if(role==='physics_guard'){
    return {
      category:'physics',
      directives:[
        'Preserve SI-like world units and explicit gravity.',
        'Fail closed on invalid mass, transform and collider values.',
        'Keep the initial solver simple and deterministic before adding accelerated backends.'
      ],
      findings:[
        world?.gravity?null:'gravity_missing',
        duplicates.length?`duplicate_entity_ids:${duplicates.join(',')}`:null
      ].filter(Boolean)
    };
  }

  if(role==='ecs_guard'){
    return {
      category:'ecs',
      directives:[
        'Entity identity must remain canonical regardless of insertion or query order.',
        'Component and tag indexes are derived acceleration structures, never competing state authority.',
        'Queries must return stable ordering so receipts and agent decisions are reproducible.'
      ],
      findings:duplicates.length?[`duplicate_entity_ids:${duplicates.join(',')}`]:[]
    };
  }

  if(role==='scene_streaming_guard'){
    return {
      category:'scene_streaming',
      directives:[
        'Chunk activation must derive deterministically from explicit bounds, preload radius, focus and pinned dependencies.',
        'An entity may have one chunk owner; unassigned entities remain global rather than disappearing silently.',
        'Inactive entities preserve state and stop simulation until reactivated.',
        'Streaming changes simulation residency only and must not mutate Fallen canon, Worldstate evidence or source assets.'
      ],
      findings:[]
    };
  }

  if(role==='animation_guard'){
    return {
      category:'animation',
      directives:[
        'Treat skeletal animation state as deterministic world state, not renderer-owned hidden state.',
        'Validate bone hierarchy, clip references, transition references and keyframe bounds fail-closed.',
        'Animation parameters must enter through tick-bound world inputs when they affect replay truth.',
        'Inactive streamed entities must freeze animation time and resume from preserved state.',
        'Renderers consume sampled poses and events but do not become animation authority.'
      ],
      findings:[]
    };
  }

  if(role==='navigation_guard'){
    return {
      category:'navigation',
      directives:[
        'Navigation meshes are shared world data and path selection must remain deterministic for identical inputs.',
        'Polygon adjacency must validate fail-closed and path tie-breaking must be canonical.',
        'Navigation targets that affect replay truth must enter through tick-bound world inputs.',
        'Navigation chooses desired locomotion; physics remains authority for actual entity movement and collision.',
        'Streamed-out agents freeze path progress and resume from preserved navigation state.',
        'Renderer/debug clients may inspect paths but never become navigation authority.'
      ],
      findings:[]
    };
  }

  if(role==='visual_scene_guard'){
    return {
      category:'visual_scene',
      directives:[
        'Materials, renderables, lights and cameras are canonical world data, not renderer-private configuration.',
        'Material and camera references must validate fail-closed before a world can run.',
        'Camera activation and blends that affect replay truth must enter through tick-bound world inputs.',
        'Camera interpolation must be resolved by World Engine so renderer adapters cannot invent shot timing or motion.',
        'Layer masks and scene residency must deterministically gate visible renderables and lights.',
        'Renderer backends consume visual-frame contracts but remain replaceable and non-authoritative.'
      ],
      findings:[]
    };
  }

  if(role==='audio_scene_guard'){
    return {
      category:'audio_scene',
      directives:[
        'Fallen remains authority for authored/mastered audio assets while World Engine owns playback and spatial runtime state.',
        'Clip, bus, emitter and listener references must validate fail-closed before simulation.',
        'Play, pause, stop, seek and listener changes that affect replay truth must enter through tick-bound world inputs.',
        'Streamed-out emitters freeze playhead state and resume without silently advancing.',
        'Spatial attenuation and effective gain must be deterministic inputs to replaceable audio backends, not backend-private truth.',
        'Audio adapters consume audio-frame contracts but do not gain canon, publication or payment authority.'
      ],
      findings:[]
    };
  }

  if(role==='replication_guard'){
    return {
      category:'replication',
      directives:[
        'Authoritative checkpoints must bind to the same world definition digest and pass snapshot integrity verification before restore.',
        'Prediction inputs and checkpoints must use deterministic packet digests, but packet hashes must never be treated as peer authentication.',
        'Late authority inputs fail closed unless an explicit server-rollback policy is added; the v8 authority path must not silently rewrite committed history.',
        'Client rollback must discard stale past predictions, replay eligible future inputs in canonical order, and converge to authoritative state.',
        'Rollback memory is bounded and checkpoints outside the configured window fail closed.',
        'Networking transport, encryption and peer authentication remain replaceable security adapters outside canonical simulation truth.'
      ],
      findings:[]
    };
  }

  if(role==='webgpu_guard'){
    return {
      category:'webgpu',
      directives:[
        'Renderer adapters must consume verified visual-frame receipts and must not become canonical scene authority.',
        'The CPU-side WebGPU plan must be deterministic for the same visual frame, geometry assets and viewport.',
        'Geometry, material, texture and light references must fail closed when required assets or UVs are missing.',
        'Owned WGSL and WebGPU browser execution remain replaceable backend code behind the visual-frame contract.',
        'Node CI may prove planning, shader contracts and failure boundaries but must not claim physical GPU-device execution.',
        'Browser GPU submission requires a real navigator.gpu adapter/device receipt before any hardware-execution claim.'
      ],
      findings:[]
    };
  }

  if(role==='webgpu_device_guard'){
    return {
      category:'webgpu_device_conformance',
      directives:[
        'Browser WebGPU conformance requires navigator.gpu, adapter acquisition, device acquisition, successful command submission and mapped readback.',
        'Feature presence or shader compilation alone is not a device-execution proof.',
        'Compute and raster readbacks must both match expected values before status can be verified.',
        'SwiftShader, llvmpipe, lavapipe and forced software profiles must always be classified as software execution and must never create a hardware GPU claim.',
        'Ambiguous adapter metadata remains adapter_type_unknown rather than being promoted to hardware.',
        'Hardware execution may be described only as adapter-reported hardware when the reported vendor/architecture provides a non-software signal.',
        'Conformance receipts must preserve launch profile, adapter metadata, readback results and the native browser preflight receipt.'
      ],
      findings:[]
    };
  }

  if(role==='texture_residency_guard'){
    return {
      category:'texture_residency',
      directives:[
        'Texture pixels, formats and sampler state must remain canonical inputs; GPU texture objects and caches are derived acceleration state.',
        'Every referenced texture must resolve to a validated asset digest before a WebGPU plan is accepted.',
        'Base-color, ORM and emissive texture bindings require explicit UV geometry and deterministic sampler normalization.',
        'Normal maps remain fail-closed until tangent-space geometry and shader contracts exist.',
        'Residency must be budgeted deterministically from required texture IDs; missing assets or over-budget required sets fail closed.',
        'Texture hot reload preserves asset identity, emits before/after digests and invalidates only the affected GPU cache entry.',
        'Renderer residency receipts describe what was loaded or evicted but do not become source-asset authority.',
        'WebGPU submission must verify the deterministic render-plan digest before creating draw commands or texture bindings.'
      ],
      findings:[]
    };
  }

  if(role==='reference_frame_guard'){
    return {
      category:'reference_frame',
      directives:[
        'Reference-frame conformance must compile the exact owned EVERCRAFT_WEBGPU_WGSL source rather than a lookalike test shader.',
        'The receipt must bind the exact shader SHA-256, browser preflight receipt, launch profile and expected/observed pixel values.',
        'Pixel verification requires real WebGPU command submission and mapped texture readback inside native Chromium.',
        'Software adapters remain valid execution proof but must never be promoted into hardware execution claims.',
        'Reference-frame CI must rerun when World Engine renderer/shader source changes so pixel evidence cannot silently become stale.',
        'A passing generic WebGPU device probe does not substitute for a passing World Engine reference-frame receipt.'
      ],
      findings:[]
    };
  }

  if(role==='normal_map_guard'){
    return {
      category:'normal_map',
      directives:[
        'Tangent-space geometry is canonical asset data: tangent vec4 count must match vertices, xyz must be non-zero and handedness must be exactly +1 or -1.',
        'Normal-mapped materials require authored UVs and tangents; renderer backends must not invent hidden tangent truth for canonical replay.',
        'Normal textures must use linear rgba8unorm sampling rather than sRGB decoding and are valid only for PBR materials.',
        'Normal texture IDs and digests participate in the same deterministic texture-residency and WebGPU-plan receipts as other material textures.',
        'Owned WGSL reconstructs a TBN basis from transformed normal/tangent plus handedness and applies the sampled tangent-space normal before lighting.',
        'Browser reference-frame conformance must bind a flat normal texture and the tangent vertex attribute so shader/layout drift fails visibly.'
      ],
      findings:[]
    };
  }

  if(role==='studio_edit_guard'){
    return {
      category:'studio_edit',
      directives:[
        'Live authoring transactions must bind to exact inspected world and asset-manifest digests before mutation.',
        'Human, agent and code edits share one versioned transaction contract and every accepted edit emits a reversible receipt.',
        'Undo restores semantic world and asset content while revision counters remain monotonic rather than falsifying history.',
        'Asset records must preserve source, rights state, license and content digest; unknown permission must never be silently upgraded.',
        'Geometry hot reload may invalidate renderer buffers for the same asset identity, but renderer caches never become asset authority.',
        'Structural/runtime-state migration beyond the defined edit contract must remain explicit and fail closed rather than silently rewriting simulation state.'
      ],
      findings:[]
    };
  }

  if(role==='runtime_migration_guard'){
    return {
      category:'runtime_migration',
      directives:[
        'Live revision migration must bind a verified source snapshot to the exact previous world-definition digest before carrying any state.',
        'Tick rate and world identity changes are migration boundaries and must fail closed rather than reinterpret simulation time.',
        'Each runtime domain is compatibility-gated independently: transform, properties, rigid-body motion, animation, navigation and audio may preserve or reset separately.',
        'Authoring changes win over stale runtime values; changed transforms or incompatible component contracts must reset the affected runtime field explicitly.',
        'Removed entities disappear, new entities receive fresh runtime state, and active scene residency reconciles deterministically.',
        'Camera/listener selection may migrate only when their referenced entities and transition contracts still exist.',
        'Collision contacts are ephemeral and must reset across a structural world revision.',
        'Every migration must emit a receipt naming preserved/reset state so Studio and agents can inspect what survived.'
      ],
      findings:[]
    };
  }

  if(role==='fallen_bridge_guard'){
    return {
      category:'fallen_bridge',
      directives:[
        'Fallen remains authoring/canon authority for creative assets and world identity.',
        'World Engine may instantiate Fallen assets but must not silently rewrite series canon.',
        'Carry asset IDs and room/camera/display contracts across the bridge.'
      ],
      findings:[]
    };
  }

  if(role==='worldstate_bridge_guard'){
    return {
      category:'worldstate_bridge',
      directives:[
        'Preserve observed, inferred, modeled and unknown evidence state on projection.',
        'Worldstate context must never become autonomous physical or adverse-decision authority.',
        'Keep source references attached to projected facts.'
      ],
      findings:[]
    };
  }

  if(role==='provenance_guard'){
    return {
      category:'provenance',
      directives:[
        'Digest canonical world definitions and snapshots.',
        'Keep source asset references and evidence references machine-readable.',
        'Receipts must describe what was simulated, not overclaim rendered or deployed capability.'
      ],
      findings:[]
    };
  }

  return {
    category:'runtime',
    directives:[
      'Target Evercraft Compute + Yard as the owned runtime path.',
      'Keep renderer, physics acceleration, networking and GPU backends replaceable.',
      'Expose health, capability and conformance surfaces before public product claims.'
    ],
    findings:[]
  };
}

export async function runAssignment({assignment}){
  const world=worldFrom(assignment.item);
  const role=assignment.role;
  const findings=[];
  if(!ROLES.has(role)) findings.push('unknown_world_engine_role');
  if(!world?.id) findings.push('world_id_missing');
  if(world?.schema!=='evercraft.world-engine.world.v1') findings.push('world_schema_invalid');

  const review=ROLES.has(role)?evaluate(role,world):null;
  findings.push(...(review?.findings || []));

  return {
    schema:'evercraft.world-engine.saban-review-note.v1',
    status:findings.length?'blocked':'completed',
    agent_id:assignment.agent_id,
    role,
    world_id:world?.id || null,
    review,
    findings,
    boundaries:{
      no_publication_authority:true,
      no_payment_authority:true,
      no_physical_action_authority:true,
      no_canon_mutation:true,
      no_provider_lock_in:true
    }
  };
}

export async function reconcile({results,plan}){
  const rows=Array.isArray(results)?results:[];
  const required=new Set(plan?.roles || []);
  const present=new Set(rows.map(row=>row?.role).filter(Boolean));
  const missing=[...required].filter(role=>!present.has(role));
  const blocked=rows.filter(row=>row?.status!=='completed');
  const reviews=Object.fromEntries(
    rows
      .filter(row=>row?.review?.category)
      .map(row=>[row.review.category,row.review])
  );

  return {
    schema:'evercraft.world-engine.saban-review.v1',
    status:missing.length||blocked.length?'blocked':'completed',
    world_id:rows.find(row=>row?.world_id)?.world_id || null,
    required_roles:[...required],
    completed_roles:[...present].sort(),
    missing_roles:missing,
    blocked_roles:blocked.map(row=>row.role),
    reviews,
    acceptance:{
      all_roles_present:missing.length===0,
      all_roles_completed:blocked.length===0,
      provider_neutral:true,
      deterministic_contract_required:true,
      evidence_boundary_required:true
    }
  };
}
