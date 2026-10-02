const ROLES=new Set([
  'engine_architect',
  'determinism_guard',
  'simulation_guard',
  'physics_guard',
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
