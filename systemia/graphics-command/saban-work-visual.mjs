// Evercraft Graphics Command: read-only Saban work-state proof view.
// This module intentionally does NOT connect to private runtimes, dispatch workers,
// publish artifacts, or attest to the truth of an untrusted input file.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const STATES=['queued','leased','completed','dead_letter'];
const NAMES={queued:'Waiting',leased:'Assigned',completed:'Completed',dead_letter:'Needs attention'};
const MAX_BYTES=8*1024*1024;
const MAX_JOBS=10000;
const ALLOWED_MODES=['synthetic_test','private_operator_snapshot'];
const cleanDate=value=>typeof value==='string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) ? value : null;
const sha256=value=>crypto.createHash('sha256').update(value).digest('hex');
const pct=(part,total)=>total===0?0:Math.round((part/total)*100);

export function projectSabanWorkProof(raw,{mode}={}){
  if(!ALLOWED_MODES.includes(mode))throw new Error('Explicit proof mode required');
  if(typeof raw!=='string'||Buffer.byteLength(raw)>MAX_BYTES)throw new Error('Invalid or oversized Saban receipt');
  let document;
  try{document=JSON.parse(raw);}catch{throw new Error('Invalid Saban JSON');}
  const fromScheduler=document?.schema==='evercraft.saban.scheduler-receipt.v1';
  const state=fromScheduler?document.state:document;
  if(state?.schema!=='evercraft.saban.work-state.v1'||!state.jobs||
     Array.isArray(state.jobs)||typeof state.jobs!=='object')throw new Error('Unsupported work-state schema');
  const updatedAt=cleanDate(state.updated_at);
  if(!updatedAt)throw new Error('Work-state timestamp missing or malformed');
  const jobs=Object.values(state.jobs);
  if(jobs.length>MAX_JOBS)throw new Error('Too many Saban jobs');
  const counts=Object.fromEntries(STATES.map(x=>[x,0]));
  let retried=0,checkpointed=0;
  for(const job of jobs){
    if(!job||!STATES.includes(job.state)||!Number.isSafeInteger(job.attempts)||
       job.attempts<0||job.attempts>1000000)throw new Error('Invalid Saban job state');
    if(job.state==='leased'&&!job.lease?.worker_id)throw new Error('Unproven job lease');
    counts[job.state]++;
    if(job.attempts>1)retried++;
    if(job.checkpoint)checkpointed++;
  }
  if(fromScheduler){
    const summary=document.summary;
    if(!summary||summary.total!==jobs.length||!summary.counts||
       STATES.some(state=>(summary.counts[state]||0)!==counts[state])){
      throw new Error('Scheduler receipt summary disagrees with jobs');
    }
  }
  // Job identifiers, agent roles, work keys, lease IDs, payloads, errors and
  // source file paths are NOT projected. Marks describe only measured states.
  // At <=48 jobs each mark is one actual state. At larger sizes, preserve
  // each nonempty lane and apportion 48 representative marks; totals above
  // remain authoritative, and marks are never presented as specific workers.
  const displayCount=Math.min(48,jobs.length);
  const allocation=Object.fromEntries(STATES.map(state=>[state,0]));
  if(jobs.length<=48){
    for(const state of STATES)allocation[state]=counts[state];
  }else{
    for(const state of STATES)if(counts[state]>0)allocation[state]=1;
    let slots=displayCount-STATES.reduce((n,s)=>n+allocation[s],0);
    const remaining=jobs.length-STATES.reduce((n,s)=>n+allocation[s],0);
    const fractions=[];
    for(const state of STATES){
      const exact=remaining?slots*(counts[state]-allocation[state])/remaining:0;
      const extra=Math.floor(exact);
      allocation[state]+=extra;
      fractions.push({state,fraction:exact-extra});
    }
    let left=displayCount-STATES.reduce((n,s)=>n+allocation[s],0);
    fractions.sort((a,b)=>b.fraction-a.fraction || STATES.indexOf(a.state)-STATES.indexOf(b.state));
    for(const {state} of fractions){
      if(left<=0)break;
      if(allocation[state]<counts[state]){allocation[state]++;left--;}
    }
  }
  const marks=STATES.flatMap(state=>Array.from({length:allocation[state]},()=>state));
  const projection={
    schema:'evercraft.graphics-command.saban-work-proof.v1',
    mode,
    source_kind:fromScheduler?'scheduler_receipt':'work_state',
    source_digest:'sha256:'+sha256(raw),
    snapshot_at:updatedAt,
    total_jobs:jobs.length,
    counts,
    retried_jobs:retried,
    checkpointed_jobs:checkpointed,
    state_marks:marks,
    marks_truncated:jobs.length>marks.length,
    historical_events:false,
    independently_attested:false,
    customer_execution_claim:false,
    publication_authority:false
  };
  return projection;
}

function assertProjection(view){
  if(view?.schema!=='evercraft.graphics-command.saban-work-proof.v1'||
     !ALLOWED_MODES.includes(view.mode)||!/^sha256:[0-9a-f]{64}$/.test(view.source_digest)||
     !cleanDate(view.snapshot_at)||
     !Number.isInteger(view.total_jobs)||view.total_jobs<0||view.total_jobs>MAX_JOBS||
     !view.counts||STATES.some(state=>!Number.isSafeInteger(view.counts[state])||view.counts[state]<0)||
     STATES.reduce((sum,s)=>sum+view.counts[s],0)!==view.total_jobs||
     !Number.isSafeInteger(view.retried_jobs)||view.retried_jobs<0||view.retried_jobs>view.total_jobs||
     !Number.isSafeInteger(view.checkpointed_jobs)||view.checkpointed_jobs<0||view.checkpointed_jobs>view.total_jobs||
     !Array.isArray(view.state_marks)||view.state_marks.length!==Math.min(48,view.total_jobs)||
     view.state_marks.some(state=>!STATES.includes(state))||
     view.historical_events!==false||view.independently_attested!==false||
     view.publication_authority!==false)throw new Error('Invalid proof-view projection');
}

export function renderSabanWorkProof(view){
  assertProjection(view);
  const title=view.mode==='synthetic_test'?'SYNTHETIC TEST SNAPSHOT':'PRIVATE OPERATOR SNAPSHOT';
  const chart=STATES.map((state,i)=>{
    const value=view.counts[state];
    return '<div class="lane"><div class="lane-header"><span class="lane-label"><span class="lane-index">0'+(i+1)+'</span> '+NAMES[state]+'</span><strong>'+value.toLocaleString('en-US')+'</strong></div>'+
      '<div class="lane-track"><span class="lane-fill '+state+'" style="width:'+pct(value,view.total_jobs)+'%"></span></div></div>';
  }).join('');
  const marks=view.state_marks.map(state=>'<i class="mark '+state+'" aria-hidden="true"></i>').join('');
  const markNote=view.marks_truncated?'48 representative state marks; the counts at left are exact':'One mark per reported job';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">'+
    '<meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<meta name="robots" content="noindex,nofollow">'+
    '<meta name="referrer" content="no-referrer">'+
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'">'+
    '<title>Saban Work Proof | Private Graphics Command</title><style>'+
    ':root{color-scheme:dark;--ink:#faf9fa;--muted:#adaab3;--hair:#36313a;--paper:#101014;--red:#ef6a82}*{box-sizing:border-box}body{background:var(--paper);color:var(--ink);margin:0;font:15px/1.55 system-ui,-apple-system,Segoe UI,sans-serif}'+
    'main{width:min(1160px,100%);padding:clamp(20px,4.5vw,64px);margin:auto}.top{display:flex;justify-content:space-between;gap:16px;align-items:center;border-bottom:1px solid var(--hair);padding-bottom:22px;flex-wrap:wrap}.logo{font-weight:850;letter-spacing:-.04em;font-size:19px}.logo b{color:var(--red)}.tag{font:700 11px/1.4 ui-monospace,monospace;letter-spacing:.07em;color:#eab3c0;border:1px solid #a3455c80;padding:8px 10px;border-radius:30px}'+
    '.intro{padding:45px 0 35px}.eyebrow{color:#f49aae;font:750 11px/1.4 ui-monospace,monospace;letter-spacing:.16em}.intro h1{font-size:clamp(40px,7vw,86px);line-height:1.01;letter-spacing:-.085em;margin:17px 0 15px;max-width:880px}.intro h1 em{font-style:normal;color:#f28ca0}.intro p{font-size:15px;color:var(--muted);max-width:660px}'+
    '.frame{display:grid;grid-template-columns:1.1fr .9fr;border:1px solid var(--hair);border-radius:22px;overflow:hidden;box-shadow:0 30px 90px #0008}.board{padding:38px;background:linear-gradient(135deg,#21191f,#151419 68%)}.board h2{font-size:12px;letter-spacing:.12em;font-weight:750;color:#ccc2c8;margin:0 0 30px;text-transform:uppercase}.big{font-size:clamp(56px,7vw,92px);line-height:1;font-weight:850;letter-spacing:-.08em}.big span{font-size:14px;letter-spacing:0;font-weight:550;color:#c1b2ba;margin-left:10px}.lanes{display:grid;gap:22px;margin-top:42px}.lane-header{display:flex;justify-content:space-between;gap:12px;margin-bottom:9px}.lane-header strong{font:800 16px ui-monospace,monospace;font-variant-numeric:tabular-nums}.lane-label{font-weight:650}.lane-index{font:650 11px ui-monospace,monospace;color:#f19aab;padding-right:8px}.lane-track{height:9px;background:#ffffff14;border-radius:12px;overflow:hidden}.lane-fill{height:100%;display:block;border-radius:12px}.lane-fill.queued,.mark.queued{background:#7b8394}.lane-fill.leased,.mark.leased{background:#f3b778}.lane-fill.completed,.mark.completed{background:#80d1bc}.lane-fill.dead_letter,.mark.dead_letter{background:#f07691}'+
    '.field{padding:38px 34px;background:radial-gradient(circle at 75% 5%,#8d2c4530,transparent 50%),#17151a;display:flex;flex-direction:column}.field h2{font-size:12px;letter-spacing:.12em;color:#ccc2c8;margin:0 0 26px}.nodes{display:grid;grid-template-columns:repeat(8,1fr);gap:13px;max-width:370px;margin:auto;align-content:center;flex:1;width:100%}.mark{display:block;aspect-ratio:1;border-radius:8px;box-shadow:0 0 18px #ffffff15}.field p{font-size:12px;color:var(--muted);margin-top:22px}.foot{border-top:1px solid var(--hair);padding-top:25px;margin-top:35px;display:grid;grid-template-columns:1fr 1fr;gap:18px}.foot strong{display:block;text-transform:uppercase;font:750 11px ui-monospace,monospace;color:#eb9bb0;margin-bottom:8px}.foot p{font-size:12px;color:#b8b2ba;margin:0}.digest{overflow-wrap:anywhere;font:11px/1.6 ui-monospace,monospace}.foot .warning{grid-column:1/-1;color:#d7cad0;border-top:1px solid var(--hair);padding-top:17px}'+
    '@media(max-width:700px){.frame{grid-template-columns:1fr}.board{padding:27px 23px}.field{min-height:280px;padding:26px 23px}.nodes{grid-template-columns:repeat(8,1fr);gap:11px;max-width:340px}.intro{padding:36px 0 26px}.foot{grid-template-columns:1fr}}'+
    '@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}'+
    '</style></head><body><main><header class="top"><div class="logo">evercraft <b>/</b> saban</div><div class="tag">'+title+'</div></header>'+
    '<section class="intro"><div class="eyebrow">GRAPHICS COMMAND · WORK STATE</div><h1>See the work.<br><em>Know the state.</em></h1>'+
    '<p>A static projection of recorded Saban job states. No live connection, inferred event history, customer claims, or autonomous action.</p></section>'+
    '<section class="frame"><div class="board"><h2>Job state distribution</h2><div class="big">'+view.total_jobs.toLocaleString('en-US')+'<span>recorded jobs</span></div>'+
    '<div class="lanes">'+chart+'</div></div><div class="field"><h2>State marks / observed snapshot</h2><div class="nodes" role="img" aria-label="'+STATES.map(s=>NAMES[s]+': '+view.counts[s]).join('; ')+'">'+marks+'</div><p>'+markNote+'. Color is state only, not an agent identity or activity animation.</p></div></section>'+
    '<footer class="foot"><div><strong>Snapshot timestamp</strong><p>'+view.snapshot_at+'</p><p>Retries: '+view.retried_jobs+' · Checkpoints: '+view.checkpointed_jobs+'</p></div>'+
    '<div><strong>Input receipt digest</strong><p class="digest">'+view.source_digest+'</p></div>'+
    '<p class="warning">Source work-state snapshot only. Its existence does not independently attest that an agent performed the work. No event history, private job IDs, roles, work payloads, worker identities, source paths or errors are embedded. This view is not authorized for public distribution.</p></footer></main></body></html>';
}

export function buildSabanWorkProof(raw,options){
  const projected=projectSabanWorkProof(raw,options);
  return {projection:projected,html:renderSabanWorkProof(projected)};
}

function main(){
  const [input,output,mode]=process.argv.slice(2);
  if(!input||!output||!ALLOWED_MODES.includes(mode)){
    throw new Error('Usage: node saban-work-visual.mjs <test-fixture.json> <output.html> synthetic_test');
  }
  if(mode==='private_operator_snapshot'){
    throw new Error('Private work-state review requires saban-work-operator.mjs with an explicit authorized source root');
  }
  const outputPath=path.resolve(output),projectRoot=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
  const publicRoot=path.join(projectRoot,'public')+path.sep;
  if(!outputPath.endsWith('.html')||outputPath.startsWith(publicRoot))
    throw new Error('Private proof output must be HTML outside the public tree');
  const outputDir=path.dirname(outputPath);
  fs.mkdirSync(outputDir,{recursive:true,mode:0o700});
  const resolvedTarget=path.join(fs.realpathSync(outputDir),path.basename(outputPath));
  if(resolvedTarget.startsWith(publicRoot)||fs.existsSync(outputPath))
    throw new Error('Refusing public or existing output path');
  const bytes=fs.readFileSync(input);
  if(bytes.length>MAX_BYTES)throw new Error('Saban input exceeds 8 MiB');
  const {html,projection}=buildSabanWorkProof(bytes.toString('utf8'),{mode});
  fs.writeFileSync(outputPath,html,{mode:0o600,flag:'wx'});
  process.stdout.write(JSON.stringify({schema:projection.schema,output:outputPath,
    mode:projection.mode,total_jobs:projection.total_jobs,source_digest:projection.source_digest,
    publication_authority:false})+'\n');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
