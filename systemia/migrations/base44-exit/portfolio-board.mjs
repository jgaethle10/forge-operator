import { createHash } from 'node:crypto';

function clean(value){
  return String(value??'').normalize('NFKC').trim().replace(/\s+/g,' ');
}
function normalized(value){ return clean(value).toLowerCase(); }
function sha(value){ return 'sha256:'+createHash('sha256').update(String(value)).digest('hex'); }

function aliasMap(rows=[]){
  const map=new Map();
  for(const row of rows||[]){
    const source=normalized(row?.source_name);
    const product=clean(row?.queue_product);
    const authority=clean(row?.authority_receipt_ref);
    if(!source||!product||!authority) throw new Error('portfolio_board_alias_invalid');
    if(map.has(source)&&map.get(source).product!==product) throw new Error('portfolio_board_alias_conflict');
    map.set(source,{product,authority_receipt_ref:authority});
  }
  return map;
}

function implementationState(policy,targetKey){
  const impl=policy?.landing_implementations?.[targetKey];
  if(!impl) return {state:'missing',source_refs:[],boundary:null};
  return {
    state:clean(impl.state)||'unknown',
    source_refs:Array.isArray(impl.source_refs)?impl.source_refs.map(String):[],
    boundary:clean(impl.boundary)||null
  };
}

function implementationReady(state){
  return /^(owned|proved|available)/i.test(String(state||'')) ||
    /owned_baseline_proved_local|proved_local/i.test(String(state||''));
}

export function buildPortfolioMigrationBoard({
  plans=[],
  queue=[],
  policy={},
  aliasReceipts=[]
}={}){
  if(!Array.isArray(plans)) throw new Error('portfolio_board_plans_array_required');
  if(!Array.isArray(queue)) throw new Error('portfolio_board_queue_array_required');

  const queueByName=new Map();
  for(const row of queue){
    const product=clean(row?.product);
    if(!product) throw new Error('portfolio_board_queue_product_required');
    const key=normalized(product);
    if(queueByName.has(key)) throw new Error('portfolio_board_queue_duplicate_product');
    queueByName.set(key,row);
  }
  const aliases=aliasMap(aliasReceipts);

  const apps=[];
  const blockerCounts={};
  const missingTargetCounts={};
  const targetUseCounts={};
  const seenFingerprints=new Set();

  for(const plan of plans){
    if(plan?.schema!=='evercraft.base44-evac.app-plan.v1') throw new Error('portfolio_board_plan_schema_invalid');
    const fingerprint=clean(plan?.source?.fingerprint);
    if(!fingerprint) throw new Error('portfolio_board_source_fingerprint_required');
    if(seenFingerprints.has(fingerprint)) throw new Error('portfolio_board_duplicate_source_fingerprint');
    seenFingerprints.add(fingerprint);

    const sourceName=clean(plan?.source?.name);
    const exact=queueByName.get(normalized(sourceName))||null;
    const alias=aliases.get(normalized(sourceName))||null;
    const aliasTarget=alias?queueByName.get(normalized(alias.product)):null;
    if(alias&&!aliasTarget) throw new Error('portfolio_board_alias_target_missing');
    const queueRow=exact||aliasTarget||null;

    const targetStates=(plan.destination_targets||[]).map((target)=>{
      const impl=implementationState(policy,target.key);
      targetUseCounts[target.key]=(targetUseCounts[target.key]||0)+1;
      if(!implementationReady(impl.state)) missingTargetCounts[target.key]=(missingTargetCounts[target.key]||0)+1;
      return {
        target_key:target.key,
        implementation_state:impl.state,
        implementation_ready:implementationReady(impl.state)
      };
    });

    for(const gate of plan?.readiness?.blocked_gates||[]){
      blockerCounts[gate]=(blockerCounts[gate]||0)+1;
    }

    apps.push({
      source_fingerprint:fingerprint,
      queue_product:queueRow?clean(queueRow.product):null,
      queue_wave:queueRow?Number(queueRow.wave||0)||null:null,
      queue_state:queueRow?clean(queueRow.state)||null:null,
      queue_role:queueRow?clean(queueRow.role)||null:null,
      match_mode:exact?'exact_normalized_name':alias?'authorized_alias':'unmatched_private_source',
      alias_authority_receipt_ref:alias?alias.authority_receipt_ref:null,
      source_name_emitted:Boolean(queueRow),
      readiness_status:plan.readiness?.status||'unknown',
      blocked_gates:[...(plan.readiness?.blocked_gates||[])],
      complexity_score:Number(plan.complexity_score||0),
      required_targets:targetStates,
      missing_shared_targets:targetStates.filter((row)=>!row.implementation_ready).map((row)=>row.target_key),
      cutover_authority:false
    });
  }

  apps.sort((a,b)=>{
    const aw=a.queue_wave??9999, bw=b.queue_wave??9999;
    return aw-bw ||
      String(a.queue_product||'').localeCompare(String(b.queue_product||'')) ||
      a.source_fingerprint.localeCompare(b.source_fingerprint);
  });

  const waveIds=[...new Set(apps.map((row)=>row.queue_wave).filter((v)=>v!=null))].sort((a,b)=>a-b);
  const waves=waveIds.map((wave)=>{
    const rows=apps.filter((row)=>row.queue_wave===wave);
    const blockers={};
    const missing={};
    for(const row of rows){
      for(const gate of row.blocked_gates) blockers[gate]=(blockers[gate]||0)+1;
      for(const target of row.missing_shared_targets) missing[target]=(missing[target]||0)+1;
    }
    return {
      wave,
      queued_apps:rows.length,
      cutover_ready:rows.filter((row)=>row.readiness_status==='cutover_ready').length,
      blocked:rows.filter((row)=>row.readiness_status!=='cutover_ready').length,
      blocker_counts:Object.fromEntries(Object.entries(blockers).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))),
      missing_shared_target_counts:Object.fromEntries(Object.entries(missing).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])))
    };
  });

  const sharedWork=[
    ...Object.entries(missingTargetCounts).map(([key,count])=>({
      kind:'shared_target_missing',
      key,
      affected_apps:count
    })),
    ...Object.entries(blockerCounts).map(([key,count])=>({
      kind:'cutover_gate_blocker',
      key,
      affected_apps:count
    }))
  ].sort((a,b)=>b.affected_apps-a.affected_apps||a.kind.localeCompare(b.kind)||a.key.localeCompare(b.key));

  return {
    schema:'evercraft.base44.portfolio-migration-board.v1',
    generated_at:new Date().toISOString(),
    counts:{
      plans:apps.length,
      queued_matches:apps.filter((row)=>row.queue_product).length,
      unqueued_private_sources:apps.filter((row)=>!row.queue_product).length,
      cutover_ready:apps.filter((row)=>row.readiness_status==='cutover_ready').length,
      blocked:apps.filter((row)=>row.readiness_status!=='cutover_ready').length
    },
    waves,
    target_use_counts:Object.fromEntries(Object.entries(targetUseCounts).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))),
    missing_shared_target_counts:Object.fromEntries(Object.entries(missingTargetCounts).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))),
    blocker_counts:Object.fromEntries(Object.entries(blockerCounts).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))),
    shared_work_queue:sharedWork,
    apps,
    privacy:{
      raw_source_ids_emitted:false,
      unmatched_source_names_emitted:false,
      source_fingerprints_only_for_unmatched:true
    },
    authority:{
      traffic_cutover:false,
      source_decommission:false,
      source_mutation:false,
      payment:false
    },
    board_fingerprint:sha(JSON.stringify(apps.map((row)=>({
      source_fingerprint:row.source_fingerprint,
      queue_product:row.queue_product,
      readiness_status:row.readiness_status,
      blocked_gates:row.blocked_gates,
      missing_shared_targets:row.missing_shared_targets
    }))))
  };
}

export function assertPortfolioBoardPrivacy(board){
  if(board?.privacy?.raw_source_ids_emitted!==false) throw new Error('portfolio_board_raw_source_id_policy_failed');
  if(board?.privacy?.unmatched_source_names_emitted!==false) throw new Error('portfolio_board_unmatched_name_policy_failed');
  for(const row of board?.apps||[]){
    if(!row.queue_product&&row.source_name_emitted!==false) throw new Error('portfolio_board_unmatched_name_emitted');
  }
  return true;
}
