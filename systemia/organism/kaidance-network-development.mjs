#!/usr/bin/env node
// Network/Saban reviewer within the EXISTING Kaidance company heartbeat.
// Only two bounded GitHub REST GETs. No coding, launch, merge, email or deploy.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomBytes} from 'node:crypto';

const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const sha=v=>'sha256:'+createHash('sha256').update(JSON.stringify(v)).digest('hex');
const KEY=/^[0-9a-f]{40}$/;
const ACTIONS={
 ci_failed:'investigate_failed_network_ci',
 ci_pending:'reconcile_network_ci_run',
 field_gate_due:'run_authorized_cross_device_encrypted_outage_test',
 merged_needs_readback:'verify_owned_network_runtime_and_field_receipts',
 held_source:'reconcile_network_pr_source'
};
function configOK(c){
 if(c?.schema!=='evercraft.kaidance.network-development-source.v1'||
 c.github_repository!=='jgaethle10/forge-operator'||c.pull_request!==2240||
 c.expected_head_branch!=='feature/network-saban-resilience-revival-20261117'||
 c.expected_base_branch!=='main'||c.heartbeat_seconds!==300||
 c.lane_key!=='education-network'||c.product_key!=='evercraft-network'||
 JSON.stringify(c.required_workflows)!==JSON.stringify(['Network Saban Offline Resilience Tests','Forge checks'])||
 c.field_validation_verified!==false||c.live_systemia_dispatch_authorized!==false||
 c.auto_deploy!==false||c.auto_merge!==false||c.code_write_authorized!==false||
 c.production_network_changes_authorized!==false)
  throw Error('untrusted_network_development_source');
 return c;
}
export function planNetworkDevelopment({config,pr=null,workflows=null,previous=null,now=new Date()}={}){
 configOK(config);
 const clock=new Date(now);
 if(!Number.isFinite(clock.getTime()))throw Error('invalid_network_review_clock');
 let phase='held_source',head_sha=null,draft=null,pr_state=null,checks=[],reason='source_unavailable';
 if(pr){
  head_sha=typeof pr.head?.sha==='string'&&KEY.test(pr.head.sha)?pr.head.sha:null;
  const matched=pr.number===2240 &&
   pr.base?.ref===config.expected_base_branch &&
   pr.head?.ref===config.expected_head_branch &&
   pr.base?.repo?.full_name===config.github_repository &&
   pr.head?.repo?.full_name===config.github_repository;
  draft=pr.draft===true;pr_state=pr.state;
  if(matched&&head_sha&&['open','closed'].includes(pr_state)){
   const rows=Array.isArray(workflows?.workflow_runs)?workflows.workflow_runs:[];
   if(rows.length>100)throw Error('workflow_review_budget_exceeded');
   checks=config.required_workflows.map(name=>{
    const found=rows.filter(x=>x.name===name&&x.head_sha===head_sha&&x.event==='pull_request')
      .sort((a,b)=>Date.parse(b.created_at||0)-Date.parse(a.created_at||0))[0];
    return {name,status:found?.status==='completed'?
     found.conclusion==='success'?'success':found.conclusion==='failure'||found.conclusion==='timed_out'?'failed':'held':
     'pending'};
   });
   if(pr.merged===true&&pr_state==='closed')phase='merged_needs_readback';
   else if(pr_state!=='open') {phase='held_source';reason='pull_request_closed_unmerged';}
   else if(checks.some(x=>x.status==='failed'))phase='ci_failed';
   else if(checks.some(x=>x.status!=='success'))phase='ci_pending';
   else phase='field_gate_due';
   if(phase!=='held_source')reason=null;
  }else reason='unexpected_pr_identity_or_ref';
 }
 const progress=phase==='field_gate_due'?'ci_green_not_field_proven':
  phase==='merged_needs_readback'?'source_merged_not_runtime_proven':'held';
 const stableRef=sha({repo:config.github_repository,pr:2240,head_sha,phase,checks,reason});
 const changed=previous?.schema==='evercraft.kaidance.network-development-state.v1'&&
 previous.decision_ref===stableRef?0:1;
 const work_key='network:'+phase+':'+(head_sha?head_sha.slice(0,12):'unverified');
 const candidate={work_key,lane_key:'education-network',priority:phase==='ci_failed'?1:2,
  action:ACTIONS[phase],authority:'systemia_operator_review_required',
  execution_authorized:false,code_write_authorized:false,
  production_mutation_authorized:false,field_validated:false};
 const report={schema:'evercraft.kaidance.network-development.v1',
  observed_at:clock.toISOString(),source_authority:pr?'github_rest_read_only':'not_connected',
  source_reference:'github:jgaethle10/forge-operator:pull:2240',
  repo:config.github_repository,pr_number:2240,head_sha,pr_state,draft,
  heartbeat_seconds:300,phase,reason,progress,checks,
  decision_ref:stableRef,newly_seen:changed,
  candidate,field_validation_verified:false,encrypted_two_host_delivery_verified:false,
  real_wan_outage_verified:false,operator_review_required:true,
  worker_dispatched:false,code_changes:0,production_deployments:0,
  automatic_pr_writes:0,carrier_contacts:0};
 report.receipt_hash=sha({...report,receipt_hash:null});
 return {report,state:{schema:'evercraft.kaidance.network-development-state.v1',
  decision_ref:stableRef,head_sha,phase}};
}
function writePrivateJson(file,value){
 const dir=path.dirname(file);fs.mkdirSync(dir,{recursive:true,mode:0o700});
 if(fs.lstatSync(dir).isSymbolicLink()||fs.existsSync(file)&&fs.lstatSync(file).isSymbolicLink())
  throw Error('network_output_symlink_refused');
 const tmp=file+'.'+process.pid+'.'+randomBytes(4).toString('hex')+'.tmp';
 try{fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});fs.renameSync(tmp,file);}
 finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
}
async function getJson(url,token,fetcher){
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),8000);
 try{
  const r=await fetcher(url,{method:'GET',redirect:'error',signal:ctl.signal,
   headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,
    'X-GitHub-Api-Version':'2022-11-28','User-Agent':'evercraft-kaidance-network-review'}});
  if(!r.ok)throw Error('github_read_unavailable');
  const raw=await r.text();
  if(raw.length>400000)throw Error('github_response_budget_exceeded');
  return JSON.parse(raw);
 }finally{clearTimeout(timer);}
}
export async function runNetworkDevelopment({outDir,now=new Date(),token=process.env.GITHUB_TOKEN||'',fetcher=fetch,root=ROOT}={}){
 if(!outDir||!path.isAbsolute(path.resolve(outDir)))throw Error('absolute_output_required');
 const config=configOK(JSON.parse(fs.readFileSync(path.join(root,'registry/kaidance-network-development.v1.json'),'utf8')));
 const statePath=path.join(path.resolve(outDir),'state.json');
 const previous=fs.existsSync(statePath)?JSON.parse(fs.readFileSync(statePath,'utf8')):null;
 let pr=null,workflows=null,error=null;
 if(token){
  try{
   const prefix='https://api.github.com/repos/'+config.github_repository;
   pr=await getJson(prefix+'/pulls/'+config.pull_request,token,fetcher);
   if(pr?.head?.sha && KEY.test(pr.head.sha))
    workflows=await getJson(prefix+'/actions/runs?event=pull_request&head_sha='+pr.head.sha+'&per_page=100',token,fetcher);
  }catch{pr=null;workflows=null;error='github_read_unavailable';}
 }
 const planned=planNetworkDevelopment({config,pr,workflows,previous,now});
 // The HOLD report remains hash-consistent even when an API read fails.
 // A failed GitHub GET is a HOLD, not an implied zero or green.
 const out=path.resolve(outDir);
 writePrivateJson(path.join(out,'latest.json'),planned.report);
 writePrivateJson(path.join(out,'mission-snapshot.json'),{
  schema:'evercraft.kaidance.mission-snapshot.v1',
  observed_at:planned.report.observed_at,snapshot_ref:planned.report.decision_ref,
  counts:{scanned:pr?1:0,changed:planned.report.newly_seen,admitted:0,held:1},
  evidence_refs:[planned.report.source_reference,planned.report.head_sha].filter(Boolean)
 });
 writePrivateJson(statePath,planned.state);
 return planned.report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const i=process.argv.indexOf('--out');
 const out=i>=0?process.argv[i+1]:path.join(ROOT,'artifacts/kaidance-network-development');
 try{
  const r=await runNetworkDevelopment({outDir:out});
  console.log(JSON.stringify({schema:r.schema,phase:r.phase,
    head_sha:r.head_sha,decision_ref:r.decision_ref,newly_seen:r.newly_seen,
    no_code_or_network_mutations:true}));
 }catch(e){console.error(JSON.stringify({status:'HELD',reason:String(e.message).slice(0,100)}));process.exitCode=1;}
}
