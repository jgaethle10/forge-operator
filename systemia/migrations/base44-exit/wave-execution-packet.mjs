import { createHash } from 'node:crypto';

function clean(value){ return String(value??'').trim(); }
function sha(value){ return 'sha256:'+createHash('sha256').update(String(value)).digest('hex'); }
function unique(values){ return [...new Set((values||[]).filter(Boolean))]; }

const STAGES=Object.freeze({
  source_capture:{
    key:'source_capture',
    applies:()=>true,
    depends_on:[],
    evidence:[
      'source_profile_receipt',
      'source_code_capture_receipt',
      'dependency_scan_receipt',
      'route_inventory_receipt'
    ],
    authority:'read_only_source'
  },
  schema_data:{
    key:'schema_data',
    applies:(r)=>r.has('structured_data'),
    depends_on:['source_capture'],
    evidence:[
      'schema_mapping_receipt',
      'terminal_source_exhaustion_receipt',
      'entity_transfer_manifest',
      'destination_reconciliation_receipt',
      'delta_sync_or_write_freeze_plan'
    ],
    authority:'destination_write_only'
  },
  identity:{
    key:'identity',
    applies:(r)=>r.has('identity'),
    depends_on:['source_capture'],
    evidence:[
      'identity_mapping_receipt',
      'owned_session_parity_receipt',
      'authorization_parity_receipt',
      'credential_copy_forbidden_receipt'
    ],
    authority:'owned_identity_only'
  },
  runtime:{
    key:'runtime',
    applies:(r)=>r.has('server_functions'),
    depends_on:['source_capture'],
    evidence:[
      'function_inventory_receipt',
      'owned_runtime_mapping_receipt',
      'function_parity_receipt',
      'runtime_health_receipt'
    ],
    authority:'yard_candidate_runtime'
  },
  scheduled_work:{
    key:'scheduled_work',
    applies:(r)=>r.has('scheduled_work_review'),
    depends_on:['runtime'],
    evidence:[
      'scheduled_work_classification_receipt',
      'owned_scheduler_receipt_or_no_job_receipt',
      'idempotency_retry_receipt'
    ],
    authority:'owned_scheduler_only'
  },
  connectors:{
    key:'connectors',
    applies:(r)=>r.has('connector_reauthorization'),
    depends_on:['identity','runtime'],
    evidence:[
      'provider_reauthorization_receipt',
      'owned_oauth_callback_receipt',
      'connector_scope_parity_receipt',
      'plaintext_credential_copy_absence_receipt'
    ],
    authority:'provider_reauthorization_only'
  },
  webhooks:{
    key:'webhooks',
    applies:(r)=>r.has('webhook_review')||r.has('webhook_repoint'),
    depends_on:['runtime'],
    evidence:[
      'webhook_sender_inventory_receipt',
      'owned_webhook_route_receipt',
      'signature_replay_proof',
      'provider_repoint_verification_receipt'
    ],
    authority:'owned_ingress_candidate'
  },
  commerce:{
    key:'commerce',
    applies:(r)=>r.has('payment_path'),
    depends_on:['runtime'],
    evidence:[
      'checkout_contract_parity_receipt',
      'provider_payment_verification_receipt',
      'refund_dispute_path_review_receipt',
      'no_test_payment_claimed_as_revenue_receipt'
    ],
    authority:'provider_truth_only'
  },
  object_storage:{
    key:'object_storage',
    applies:(r)=>r.has('object_storage_review'),
    depends_on:['source_capture'],
    evidence:[
      'storage_inventory_receipt',
      'object_transfer_receipt_or_no_object_state_receipt',
      'reference_integrity_receipt'
    ],
    authority:'destination_storage_only'
  },
  machine_surfaces:{
    key:'machine_surfaces',
    applies:(r)=>r.has('machine_surfaces'),
    depends_on:['runtime'],
    evidence:[
      'mcp_openapi_discovery_inventory_receipt',
      'owned_machine_surface_parity_receipt',
      'machine_route_candidate_receipt'
    ],
    authority:'candidate_public_machine_surface'
  },
  parity:{
    key:'parity',
    applies:()=>true,
    depends_on:['source_capture'],
    evidence:[
      'critical_journey_parity_receipt',
      'adversarial_failure_receipt',
      'observability_receipt'
    ],
    authority:'test_only'
  },
  route_stage:{
    key:'route_stage',
    applies:(r)=>r.has('route_cutover'),
    depends_on:['runtime','parity'],
    evidence:[
      'immutable_release_ref',
      'yard_deployment_receipt',
      'route_registry_stage_receipt',
      'route_binding_receipt',
      'route_probe_receipt'
    ],
    authority:'stage_and_verify_only'
  },
  rollback:{
    key:'rollback',
    applies:(r)=>r.has('rollback'),
    depends_on:['route_stage'],
    evidence:[
      'rollback_target_receipt',
      'rollback_rehearsal_receipt',
      'data_divergence_boundary_receipt'
    ],
    authority:'rollback_preparation_only'
  },
  sentinel:{
    key:'sentinel',
    applies:(r)=>r.has('sentinel'),
    depends_on:['route_stage'],
    evidence:[
      'post_cutover_sentinel_profile_receipt',
      'health_probe_receipt',
      'alert_route_receipt'
    ],
    authority:'observation_only'
  },
  cutover:{
    key:'cutover',
    applies:(r)=>r.has('route_cutover'),
    depends_on:['schema_data','identity','runtime','scheduled_work','connectors','webhooks','commerce','object_storage','machine_surfaces','parity','route_stage','rollback','sentinel'],
    evidence:[
      'explicit_cutover_authority_receipt',
      'write_freeze_or_dual_write_final_receipt',
      'route_registry_activation_receipt'
    ],
    authority:'separate_explicit_gate'
  },
  observation:{
    key:'observation',
    applies:(r)=>r.has('route_cutover'),
    depends_on:['cutover'],
    evidence:[
      'observation_window_receipt',
      'destination_health_receipt',
      'error_rate_parity_receipt',
      'source_rollback_window_state_receipt'
    ],
    authority:'observation_only'
  },
  decommission:{
    key:'decommission',
    applies:(r)=>r.has('route_cutover'),
    depends_on:['observation'],
    evidence:[
      'separate_source_decommission_authority_receipt',
      'legacy_dependency_absence_receipt',
      'final_data_reconciliation_receipt'
    ],
    authority:'separate_human_gate'
  }
});

function normalizeStageDependencies(stages){
  const included=new Set(stages.map((row)=>row.stage));
  return stages.map((row)=>({
    ...row,
    depends_on:row.depends_on.filter((key)=>included.has(key))
  }));
}

function packetProduct(source,queueRow){
  const requirements=new Set(source.migration_requirements||[]);
  const stages=normalizeStageDependencies(
    Object.values(STAGES)
      .filter((stage)=>stage.applies(requirements))
      .map((stage)=>({
        stage:stage.key,
        state:'blocked_pending_evidence',
        depends_on:[...stage.depends_on],
        required_evidence:[...stage.evidence],
        authority:stage.authority
      }))
  );
  return {
    product:source.product,
    wave:Number(queueRow.wave),
    role:queueRow.role,
    target:queueRow.target,
    source_profile_state:queueRow.state,
    source_counts:{
      entity_schemas:Number(source.entity_count||0),
      server_functions:Number(source.function_count||0),
      connected_connectors:Number(source.connected_connector_count||0)
    },
    observed_surface_signals:[...(source.observed_surface_signals||[])],
    migration_requirements:[...requirements],
    execution_stages:stages,
    first_runnable_stage:'source_capture',
    cutover_stage_present:stages.some((row)=>row.stage==='cutover'),
    automatic_cutover_allowed:false,
    automatic_decommission_allowed:false
  };
}

export function buildWaveExecutionPacket({profile,queue=[],policy={}}={}){
  if(profile?.schema!=='evercraft.base44.wave-source-profile.v1') throw new Error('wave_packet_profile_schema_invalid');
  const wave=Number(profile.wave);
  if(!Number.isInteger(wave)||wave<1) throw new Error('wave_packet_wave_invalid');
  const queueRows=(queue||[]).filter((row)=>Number(row.wave)===wave);
  const byName=new Map(queueRows.map((row)=>[clean(row.product),row]));
  if(byName.size!==queueRows.length) throw new Error('wave_packet_duplicate_queue_product');

  const products=(profile.products||[]).map((source)=>{
    const row=byName.get(clean(source.product));
    if(!row) throw new Error('wave_packet_profile_product_not_in_queue:'+clean(source.product));
    return packetProduct(source,row);
  });
  if(products.length!==queueRows.length) throw new Error('wave_packet_profile_does_not_cover_queue');

  const requiredLanding=new Set();
  for(const product of products){
    for(const requirement of product.migration_requirements){
      const map={
        structured_data:'canonical_data',
        identity:'identity_boundary',
        server_functions:'yard_runtime',
        scheduled_work_review:'resident_scheduler',
        connector_reauthorization:'connector_gateway',
        webhook_review:'webhook_gateway',
        webhook_repoint:'webhook_gateway',
        payment_path:'commerce_boundary',
        object_storage_review:'object_storage',
        machine_surfaces:'fabric_discovery',
        route_cutover:'route_registry',
        rollback:'public_edge',
        sentinel:'portfolio_sentinel',
        secret_rekey:'secret_store'
      };
      if(map[requirement]) requiredLanding.add(map[requirement]);
    }
  }

  const landing=[...requiredLanding].sort().map((key)=>{
    const implementation=policy?.landing_implementations?.[key]||null;
    return {
      key,
      implementation_state:implementation?.state||'missing',
      source_refs:Array.isArray(implementation?.source_refs)?implementation.source_refs:[],
      shared_primitive_available:Boolean(implementation)&&!/missing|blocked|held/i.test(String(implementation?.state||''))
    };
  });

  const packet={
    schema:'evercraft.base44.wave-execution-packet.v1',
    wave,
    generated_at:new Date().toISOString(),
    source_profile_observed_at:profile.observed_at,
    products,
    totals:{
      products:products.length,
      entity_schemas:products.reduce((sum,row)=>sum+row.source_counts.entity_schemas,0),
      server_functions:products.reduce((sum,row)=>sum+row.source_counts.server_functions,0),
      connected_connectors:products.reduce((sum,row)=>sum+row.source_counts.connected_connectors,0),
      execution_stages:products.reduce((sum,row)=>sum+row.execution_stages.length,0)
    },
    required_shared_landing_primitives:landing,
    missing_shared_landing_primitives:landing.filter((row)=>!row.shared_primitive_available).map((row)=>row.key),
    sequencing:{
      source_read_only_until_decommission:true,
      shared_primitives_before_product_cutover:true,
      stage_and_verify_route_before_cutover:true,
      explicit_cutover_authority_required:true,
      observation_before_decommission:true,
      separate_decommission_authority_required:true
    },
    authority:{
      source_mutation:false,
      source_decommission:false,
      dns_mutation:false,
      traffic_cutover:false,
      provider_credential_copy:false,
      payment_creation:false
    },
    packet_fingerprint:null
  };
  packet.packet_fingerprint=sha(JSON.stringify({
    wave:packet.wave,
    products:packet.products,
    landing:packet.required_shared_landing_primitives.map((row)=>({key:row.key,state:row.implementation_state}))
  }));
  return packet;
}

export function nextWaveActions(packet){
  if(packet?.schema!=='evercraft.base44.wave-execution-packet.v1') throw new Error('wave_packet_schema_invalid');
  const actions=[];
  for(const primitive of packet.required_shared_landing_primitives||[]){
    if(!primitive.shared_primitive_available){
      actions.push({
        priority:0,
        scope:'shared',
        action:'land_shared_primitive',
        key:primitive.key,
        blocks_products:packet.products.length
      });
    }
  }
  for(const product of packet.products||[]){
    const stage=product.execution_stages.find((row)=>row.state!=='satisfied');
    if(stage){
      actions.push({
        priority:1,
        scope:'product',
        product:product.product,
        action:'satisfy_stage',
        stage:stage.stage,
        required_evidence:stage.required_evidence
      });
    }
  }
  return actions.sort((a,b)=>a.priority-b.priority||String(a.product||a.key).localeCompare(String(b.product||b.key)));
}

export function assertWavePacketBoundaries(packet){
  for(const key of ['source_mutation','source_decommission','dns_mutation','traffic_cutover','provider_credential_copy','payment_creation']){
    if(packet?.authority?.[key]!==false) throw new Error('wave_packet_authority_boundary_failed:'+key);
  }
  if((packet?.missing_shared_landing_primitives||[]).length){
    const cutoverReady=(packet.products||[]).some((product)=>
      (product.execution_stages||[]).find((stage)=>stage.stage==='cutover')?.state==='satisfied'
    );
    if(cutoverReady) throw new Error('wave_packet_cutover_cannot_pass_missing_shared_primitive');
  }
  return true;
}
