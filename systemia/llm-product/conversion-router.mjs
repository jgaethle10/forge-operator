import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { output as registry } from './build-registry.mjs';

const MODULE_DIR=path.dirname(fileURLToPath(import.meta.url));
const ROOT=process.env.EVERCRAFT_ROOT?path.resolve(process.env.EVERCRAFT_ROOT):path.resolve(MODULE_DIR,'../..');
const PRIORITY_ORDER=['P0_SHARED_INFRA','P1_PUBLIC_PRODUCT','P1_MACHINE_DOOR','P2_INTERNAL_CAPABILITY','P3_ARCHAEOLOGY'];

function sha(value){
  return createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
}
function unique(values){ return [...new Set((values||[]).filter(Boolean))]; }

function actionFor(blocker){
  const b=String(blocker||'');
  if(/problem_language/.test(b)) return 'define_problem_first_intents_and_counterexamples';
  if(/human_url|human_route|human_handoff/.test(b)) return 'establish_verified_human_handoff';
  if(/machine_endpoint|machine_route|machine_contract/.test(b)) return 'prove_or_build_bounded_machine_route';
  if(/capability_mesh_contract|authorization_contract/.test(b)) return 'declare_capability_mesh_authority_context_execution_contract';
  if(/structured_output|provenance/.test(b)) return 'define_structured_output_evidence_and_provenance_contract';
  if(/test_surface|runtime_test/.test(b)) return 'add_machine_readable_conformance_test';
  if(/independent_llm|independent_discoverability/.test(b)) return 'run_brand_blind_external_llm_discovery_probe';
  if(/legacy_base44/.test(b)) return 'migrate_specialist_transport_to_owned_public_edge';
  if(/commercial|payment|checkout/.test(b)) return 'verify_machine_commerce_and_human_confirmation_path';
  if(/runtime_reachability/.test(b)) return 'run_external_runtime_canary';
  if(/capability_state/.test(b)) return 'perform_estate_archaeology_and_classify_truth_state';
  if(/dataset/.test(b)) return 'define_dataset_machine_and_provenance_contract';
  return 'inspect_and_resolve_conversion_blocker';
}

function rankedDebt(source){
  const ranks=new Map(PRIORITY_ORDER.map((p,i)=>[p,i]));
  return [...(source.debt_queue||[])].sort((a,b)=>
    (ranks.get(a.priority)??99)-(ranks.get(b.priority)??99) ||
    String(a.stable_id).localeCompare(String(b.stable_id))
  );
}

export function buildConversionPlan({source=registry,waveSize=40,now=new Date()}={}){
  const debt=rankedDebt(source);
  const byPriority=new Map(PRIORITY_ORDER.map((p)=>[p,debt.filter((x)=>x.priority===p)]));
  const selected=[];
  const selectedIds=new Set();

  // Non-starvation floor: when a priority lane has debt, reserve one slot for it.
  for(const priority of PRIORITY_ORDER){
    const row=(byPriority.get(priority)||[])[0];
    if(row && selected.length<waveSize){
      selected.push(row);
      selectedIds.add(row.stable_id);
    }
  }
  // Then fill by severity without dropping the lower lanes from the canonical queue.
  for(const row of debt){
    if(selected.length>=waveSize) break;
    if(selectedIds.has(row.stable_id)) continue;
    selected.push(row);
    selectedIds.add(row.stable_id);
  }

  const missions=selected.map((row)=>({
    mission_key:'llm-product-conversion:'+row.stable_id,
    stable_id:row.stable_id,
    name:row.name,
    priority:row.priority,
    route_via:'systemia',
    admission_state:'queued',
    execution_authority:'none_from_queue',
    blocker_count:row.blocker_count,
    blockers:row.blockers,
    next_actions:unique(row.blockers.map(actionFor)),
    acceptance:[
      'registry truth state updated from evidence',
      'human and machine discovery states remain separate',
      'no live/deployed/reachable claim without receipt',
      'consequential actions remain behind explicit authority and confirmation',
    ],
  }));

  const observedAt=now.toISOString();
  const snapshotBody={
    debt_ids:debt.map((x)=>x.stable_id),
    selected_ids:missions.map((x)=>x.stable_id),
    release_gate:source.release_gate?.state||'unknown',
  };
  const snapshot={
    schema:'evercraft.kaidance.mission-snapshot.v1',
    snapshot_ref:'llm-product-conversion:sha256:'+sha(snapshotBody),
    observed_at:observedAt,
    counts:{
      scanned:(source.entries||[]).length,
      changed:debt.length,
      admitted:missions.length,
      held:0,
    },
    evidence_refs:[
      'systemia/llm-product/build-registry.mjs',
      'artifacts/llm-product/capability-registry.json',
      'artifacts/llm-product/conversion-plan.json',
      'docs/LLM_PRODUCT_STANDARD.md',
    ],
  };

  return {
    schema:'evercraft.llm-product.conversion-plan.v1',
    generated_at:observedAt,
    doctrine:{
      route_every_mission_through_systemia:true,
      queue_grants_execution_authority:false,
      lower_priority_debt_may_not_disappear:true,
      shared_infrastructure_first:true,
      unknown_is_not_live:true,
    },
    summary:{
      total_debt:debt.length,
      wave_size:missions.length,
      remaining_after_wave:Math.max(0,debt.length-missions.length),
      by_priority:Object.fromEntries(PRIORITY_ORDER.map((p)=>[p,(byPriority.get(p)||[]).length])),
    },
    missions,
    full_queue:debt,
    mission_snapshot:snapshot,
  };
}

export function emitConversionPlan(plan=buildConversionPlan()){
  const dir=path.join(ROOT,'artifacts','llm-product');
  fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'conversion-plan.json'),JSON.stringify(plan,null,2)+'\n');
  fs.writeFileSync(path.join(dir,'mission-snapshot.json'),JSON.stringify(plan.mission_snapshot,null,2)+'\n');
  return plan;
}

const isCli=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(isCli){
  const arg=process.argv.indexOf('--wave-size');
  const waveSize=arg>=0?Math.max(1,Number(process.argv[arg+1]||40)):40;
  const plan=buildConversionPlan({waveSize});
  if(process.argv.includes('--emit')) emitConversionPlan(plan);
  process.stdout.write(JSON.stringify({summary:plan.summary,snapshot:plan.mission_snapshot},null,2)+'\n');
}
