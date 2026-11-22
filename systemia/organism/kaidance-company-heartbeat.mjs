// KAIDANCE is the company clock. Observation is not worker execution.
import {createHash} from 'node:crypto';
const SHA=value=>'sha256:'+createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const KEY=/^[a-z0-9][a-z0-9-]{1,90}$/;
function unique(a){return [...new Set(a)]}
export function validateCompanyLanes(manifest,products,supervisor){
 if(manifest?.schema!=='evercraft.kaidance.company-lanes.v1'||manifest.heartbeat_seconds!==300||!Array.isArray(manifest.lanes))throw Error('invalid_company_lanes');
 if(manifest.automatic_production_mutations!==false)throw Error('unsafe_company_lane_authority');
 if(products?.schema!=='evercraft.saban.public-product-index.v1'||!Array.isArray(products.products))throw Error('invalid_public_product_catalog');
 if(supervisor?.schema!=='evercraft.systemia.resident-supervisor-config.v1'||!Array.isArray(supervisor.services))throw Error('invalid_resident_service_catalog');
 const catalogKeys=products.products.map(p=>p.product_key);
 if(catalogKeys.some(k=>typeof k!=='string'||!KEY.test(k))||new Set(catalogKeys).size!==catalogKeys.length)throw Error('duplicate_or_invalid_product_key');
 const serviceKeys=supervisor.services.map(s=>s.service_key);
 if(serviceKeys.some(k=>typeof k!=='string'||!KEY.test(k))||new Set(serviceKeys).size!==serviceKeys.length)throw Error('duplicate_or_invalid_service_key');
 const seen=new Set(),claimedProducts=new Set();
 for(const lane of manifest.lanes){
  if(!KEY.test(lane?.lane_key)||seen.has(lane.lane_key))throw Error('invalid_or_duplicate_company_lane');
  seen.add(lane.lane_key);
  if(!['bounded_source_proof','observe_existing_workflows'].includes(lane.mode)||lane.cadence_seconds!==300)throw Error('unsupported_company_lane');
  for(const key of lane.products||[]){
   if(!catalogKeys.includes(key)||claimedProducts.has(key))throw Error('unknown_or_duplicate_company_product_binding');
   claimedProducts.add(key);
  }
  for(const key of lane.services||[]){
   if(!serviceKeys.includes(key))throw Error('unknown_company_resident_service_binding');
  }
  if(lane.mode==='bounded_source_proof'){
   if(lane.lane_key!=='worlds'||(lane.source_files||[]).length<1||(lane.proof_tests||[]).length<1)throw Error('unbounded_company_proof');
   for(const f of [...lane.source_files,...lane.proof_tests]){
    if(typeof f!=='string'||!/^(?:public\/worlds|tests)\/[a-z0-9./-]+$/.test(f)||f.includes('..')||f.includes('//'))throw Error('unsafe_company_proof_file');
   }
  }
 }
 return {catalogKeys,serviceKeys,claimedProducts,seen};
}
export function planCompanyHeartbeat({manifest,products,supervisor,previous=null,now=new Date(),worldsFingerprint='',proof=null,workflowManifestCount=0}={}){
 const validated=validateCompanyLanes(manifest,products,supervisor);
 const at=now instanceof Date?now:new Date(now);
 if(!Number.isFinite(at.getTime()))throw Error('invalid_company_heartbeat_clock');
 const tick=Math.floor(at.getTime()/300000);
 if(previous&&previous.schema!=='evercraft.kaidance.company-heartbeat-state.v1')throw Error('invalid_company_heartbeat_state');
 if(previous&&previous.tick>tick)throw Error('company_heartbeat_clock_rollback');
 if(previous?.tick===tick)return {duplicate:true,state:previous,report:null,snapshot:null};
 const catalogHash=SHA(validated.catalogKeys);
 const newKeys=previous?.observed_product_keys
  ?validated.catalogKeys.filter(key=>!previous.observed_product_keys.includes(key))
  :validated.catalogKeys;
 const unbound=validated.catalogKeys.filter(key=>!validated.claimedProducts.has(key));
 const laneReports=manifest.lanes.map(lane=>{
  const services=(lane.services||[]).map(key=>({service_key:key,status:'configured_not_runtime_verified'}));
  return {lane_key:lane.lane_key,mode:lane.mode,product_count:(lane.products||[]).length,
   service_count:services.length,services,worker_verified:false,
   source_proof:lane.lane_key==='worlds'
    ?{source_fingerprint:worldsFingerprint||null,
      status:proof?.status||'not_run',
      tests_verified:proof?.status==='passed'&&proof?.executed===true,
      actual_development_completed:false}
    :null};
 });
 const changed= Math.min(validated.catalogKeys.length+laneReports.length,
  newKeys.length+(previous?.worlds_fingerprint!==worldsFingerprint?1:0));
 const proofPassed=proof?.status==='passed'&&proof?.executed===true;
 const evidence=['source:registry/public-products.json','source:systemia/core/resident-services.json',
  'source:registry/kaidance-company-lanes.v1.json',...(worldsFingerprint?[worldsFingerprint]:[])];
 const report={
  schema:'evercraft.kaidance.company-heartbeat.v1',observed_at:at.toISOString(),tick,
  heartbeat_seconds:300,source_authority:'github_canonical',
  company_portfolio:{public_products:validated.catalogKeys.length,
   registered_lanes:laneReports.length,
   resident_services_configured:validated.serviceKeys.length,
   workflow_manifests_found:workflowManifestCount,
   products_bound_to_lane:validated.claimedProducts.size,
   products_discovered_without_named_lane:unbound.length,
   products_not_yet_named:unbound,
   new_product_keys:newKeys},
  lanes:laneReports,
  advancement:{code_changes:0,production_deployments:0,
   read_only_worlds_proof_run:proof?.executed===true,
   read_only_worlds_proof_passed:proofPassed,
   autonomous_development_workers_launched:0,
   next_actions:unbound.length?['admit_product_lane_adapters_with_existing_systemia_authority']:[],
   limitations:['source_registry_is_not_live_runtime','five_minute_schedule_is_best_effort',
    'heartbeat_does_not_imply_work_completed']},
  privacy:{public_pulse_payload:false,private_customer_data_read:false},
 };
 const state={schema:'evercraft.kaidance.company-heartbeat-state.v1',
  tick,observed_at:at.toISOString(),observed_product_keys:validated.catalogKeys,
  catalog_hash:catalogHash,worlds_fingerprint:worldsFingerprint,
  worlds_last_verified_fingerprint:proofPassed?worldsFingerprint:(previous?.worlds_last_verified_fingerprint||null),
  worlds_last_verified_at:proofPassed?at.toISOString():(previous?.worlds_last_verified_at||null)
 };
 const snapshot={schema:'evercraft.kaidance.mission-snapshot.v1',
  snapshot_ref:SHA(JSON.stringify({tick,catalogHash,worldsFingerprint,changed})),
  observed_at:at.toISOString(),
  counts:{scanned:validated.catalogKeys.length+laneReports.length,changed,admitted:0,held:0},
  evidence_refs:unique(evidence).slice(0,30)};
 return {duplicate:false,report,state,snapshot};
}
