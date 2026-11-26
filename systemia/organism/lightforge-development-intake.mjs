// Public-safe LightForge development observation, not a code-writing worker.
// The local desktop source/executables and private tester data never enter this ledger.
import {createHash} from 'node:crypto';
const KEY=/^[a-z][a-z0-9-]{1,65}$/;
const KNOWN=['canonical-source','windows-clean-install','physical-wled','network-failure-recovery','customer-beta','layout-mapping','installer-signing'];
const hash=x=>'sha256:'+createHash('sha256').update(JSON.stringify(x)).digest('hex');
export function assessLightForgeProject(manifest){
  if(manifest?.schema!=='evercraft.kaidance.lightforge-development.v1'||
     manifest.product_key!=='evercraft-lightforge'||
     manifest.mission_key!=='lightforge-consumer-beta-2026'||
     manifest.heartbeat_seconds!==300||
     manifest.visibility!=='unpublished_internal_product'||
     manifest.deployment_status!=='not_deployed'||
     manifest.commercial_status!=='do_not_sell_as_finished_product'||
     !Array.isArray(manifest.gates)||manifest.gates.length!==KNOWN.length)
       throw Error('invalid_lightforge_project_manifest');
  const authority=manifest.authority;
  if(!authority||authority.read_source!==true||authority.queue_review!==true||
     ['write_code','deploy','publish','send_outreach','accept_payment'].some(k=>authority[k]!==false))
       throw Error('unsafe_lightforge_project_authority');
  const seen=new Set();
  for(const gate of manifest.gates){
    if(!KEY.test(gate?.key)||!KNOWN.includes(gate.key)||seen.has(gate.key)||
       !Number.isInteger(gate.priority)||gate.priority<0||gate.priority>3||
       gate.state!=='unverified'||typeof gate.next_action!=='string'||
       gate.next_action.length<10||gate.next_action.length>250)
         throw Error('invalid_lightforge_release_gate');
    seen.add(gate.key);
  }
  const ordered=[...manifest.gates].sort((a,b)=>a.priority-b.priority||KNOWN.indexOf(a.key)-KNOWN.indexOf(b.key));
  const first=ordered[0];
  const report={
    schema:'evercraft.kaidance.lightforge-readiness.v1',
    product_key:manifest.product_key,mission_key:manifest.mission_key,
    visibility:manifest.visibility,release_candidate:manifest.release_candidate,
    source_status:manifest.source_status,deployment_status:manifest.deployment_status,
    commercial_status:manifest.commercial_status,status:'release_blocked',
    gates_unverified:ordered.map(g=>g.key),gates_independently_verified:0,
    next_work_key:'lightforge:gate:'+first.key,
    next_action:first.next_action,source_digest:hash(manifest),
    development_worker_dispatched:false,shipping_authorized:false,revenue_verified:false
  };
  const candidate={work_key:report.next_work_key,lane_key:'lightforge',priority:3,
    action:'review_lightforge_release_gate',authority:'systemia_operator_review_required',
    execution_authorized:false,publication_authorized:false,
    evidence_ref:'source:registry/kaidance-lightforge-development.v1.json'};
  return {report,candidate};
}
