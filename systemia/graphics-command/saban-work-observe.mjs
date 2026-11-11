// Evercraft Graphics: local, opt-in, finite observation of Saban work-state snapshots.
// This is NOT an event stream, live server, scheduler, or independently signed audit.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {openOperatorSnapshot} from './saban-work-operator.mjs';

const STATUS=['queued','leased','completed','dead_letter'];
const LABELS={queued:'Waiting',leased:'Assigned',completed:'Completed',dead_letter:'Needs attention'};
const CLOCKS=['recent_source_timestamp','stale_source_timestamp','future_source_timestamp'];
const ISO=/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$/;
const safeIso=value=>typeof value==='string'&&ISO.test(value)&&Number.isFinite(Date.parse(value));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const numeric=(value,min,max)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
const isRecord=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);

function assertObservation(entry){
  if(!isRecord(entry)||!/^sha256:[a-f0-9]{64}$/.test(entry.source_digest)||
     !isRecord(entry.clock)||!CLOCKS.includes(entry.clock.clock_state)||
     !safeIso(entry.clock.observed_at)||
     !safeIso(entry.clock.source_reported_at)||
     !numeric(entry.total_jobs,0,10000)||!isRecord(entry.counts)||
     STATUS.some(s=>!numeric(entry.counts[s],0,10000))||
     STATUS.reduce((n,s)=>n+entry.counts[s],0)!==entry.total_jobs||
     entry.live!==false||entry.publication_authority!==false)
    throw new Error('Invalid private observation');
}

export function renderObservedSnapshots(observations,{sourceClass='private_operator_snapshot'}={}){
  if(!['private_operator_snapshot','synthetic_test'].includes(sourceClass))throw new Error('Invalid observation source class');
  if(!Array.isArray(observations)||observations.length<2||observations.length>12)
    throw new Error('Expected 2 to 12 sampled observations');
  observations.forEach(assertObservation);
  const rows=observations.map((o,i)=>{
    const prev=i?observations[i-1]:null;
    const changed=prev?prev.source_digest!==o.source_digest:null;
    const label=changed===null?'BASELINE':changed?'SOURCE BYTES CHANGED':'SOURCE BYTES UNCHANGED';
    const warning=o.clock.clock_state==='future_source_timestamp'?'FUTURE SOURCE CLOCK':
      o.clock.clock_state==='stale_source_timestamp'?'OLDER SOURCE TIMESTAMP':'SOURCE DATE RECENT';
    const metrics=STATUS.map(s=>{
      const delta=prev?o.counts[s]-prev.counts[s]:null;
      const change=delta===null?'baseline':delta===0?'no net change':(delta>0?'+':'')+delta+' net';
      return '<div class="metric"><span>'+LABELS[s]+'</span><strong>'+o.counts[s]+'</strong><small>'+change+'</small></div>';
    }).join('');
    return '<section class="observation" aria-label="Sample '+(i+1)+'"><div class="obs-head"><span class="obs-no">'+String(i+1).padStart(2,'0')+'</span><div><b>'+label+'</b><small>'+warning+'</small></div><time>'+o.clock.observed_at+'</time></div>'+
      '<div class="metrics">'+metrics+'</div><div class="obs-tail">Source reported: '+o.clock.source_reported_at+' · Jobs: '+o.total_jobs+'</div></section>';
  }).join('');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">'+
    '<meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer">'+
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'">'+
    '<title>Evercraft Saban / Local Observations</title><style>'+
    ':root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#111014;color:#f8f5f6;font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}main{width:min(1030px,100%);margin:auto;padding:clamp(18px,5vw,66px)}'+
    '.top{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #353037;padding-bottom:17px;flex-wrap:wrap;font-size:13px;font-weight:800;letter-spacing:.03em}.brand em{font-style:normal;color:#f0758c}.tag{font:750 11px ui-monospace,monospace;color:#f2adc0}'+
    'h1{font-size:clamp(42px,8vw,86px);line-height:1.01;letter-spacing:-.075em;margin:50px 0 18px}h1 span{color:#f391a6}.description{max-width:740px;color:#c5bcc4;margin:0 0 30px}'+
    '.observation{background:linear-gradient(120deg,#1e1a20,#18161b);border:1px solid #443641;border-radius:17px;padding:22px 23px;margin:0 0 14px}.obs-head{display:flex;align-items:center;gap:18px;border-bottom:1px solid #413841;padding-bottom:17px;flex-wrap:wrap}.obs-no{display:grid;place-items:center;border:1px solid #a65368;border-radius:9px;color:#f69aae;width:40px;height:40px;font:800 14px ui-monospace,monospace}.obs-head>div{flex:1;min-width:120px}.obs-head b,.obs-head small{display:block}.obs-head b{font-size:12px;letter-spacing:.07em}.obs-head small{color:#f2a9b8;font:700 10px ui-monospace,monospace;margin-top:5px}.obs-head time{font:12px ui-monospace,monospace;color:#c4bac3;overflow-wrap:anywhere}'+
    '.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;padding-top:23px}.metric{border-left:2px solid #a85b70;padding-left:15px;min-width:0}.metric>span,.metric small{display:block;color:#c4b9c2;font-size:11px}.metric strong{font:850 clamp(25px,4vw,42px) system-ui,sans-serif;letter-spacing:-.06em;font-variant-numeric:tabular-nums}.metric small{color:#f0acbc}.obs-tail{font-size:11px;color:#9c939d;overflow-wrap:anywhere;margin-top:23px}.caution{border-top:1px solid #453a44;margin-top:35px;padding-top:19px;font-size:12px;color:#c3b8c1}'+
    '@media(max-width:570px){h1{margin:36px 0 14px}.metrics{grid-template-columns:repeat(2,minmax(0,1fr));row-gap:20px}.observation{padding:17px}.obs-head{gap:10px}.obs-head time{flex-basis:100%}}'+
    '</style></head><body><main><header class="top"><div class="brand">EVERCRAFT <em>/</em> SABAN</div><div class="tag">PRIVATE / FINITE / OFFLINE</div></header>'+
    '<h1>See what <span>changed.</span></h1><p class="description">'+(sourceClass==='synthetic_test'?'SYNTHETIC TEST DATA. Simulated Saban state-machine transitions rendered for graphics QA. ':'Observations from an explicitly selected local Saban snapshot file. ')+
    'Each reading is a point-in-time aggregate. Differences are <strong>net count changes</strong>, not proven per-job events or a complete execution history.</p>'+
    rows+'<footer class="caution">Source dates are self-reported and not independently authenticated. Source bytes can change without job progress, and job states can change between samples without being observed. This file is not live, not a customer receipt, and not authorized for public release. No job identifiers, worker names, task payloads, errors, file paths or credentials are embedded.</footer></main></body></html>';
}

export async function captureLocalSabanObservations({
  authorizedRoot,snapshot,reviewRoot,samples=3,intervalMs=1000,
  prefix='saban-observed',sleep=delay,now=Date.now
}={}){
  if(!numeric(samples,2,12)||!numeric(intervalMs,500,30000)||
     typeof sleep!=='function'||typeof now!=='function'||
     !/^[a-z0-9][a-z0-9_-]{0,40}$/.test(prefix))
    throw new Error('Invalid finite observation limits');
  const observations=[];
  let canonicalOutputRoot=null;
  for(let i=0;i<samples;i++){
    if(i>0)await sleep(intervalMs);
    const receipt=openOperatorSnapshot({
      authorizedRoot,snapshot,reviewRoot,
      filename:prefix+'-'+String(i+1).padStart(2,'0')+'.html',now:now()
    });
    const thisOutputRoot=path.dirname(receipt.output);
    if(canonicalOutputRoot===null)canonicalOutputRoot=thisOutputRoot;
    if(canonicalOutputRoot!==thisOutputRoot)throw new Error('Private output root changed during sampling');
    const safe={
      source_digest:receipt.source_digest,clock:receipt.clock,
      total_jobs:receipt.total_jobs,counts:receipt.counts,
      live:false,publication_authority:false
    };
    assertObservation(safe);
    observations.push(safe);
  }
  if(fs.realpathSync(canonicalOutputRoot)!==canonicalOutputRoot)
    throw new Error('Private output root changed after sampling');
  const target=path.join(canonicalOutputRoot,prefix+'-observations.html');
  const html=renderObservedSnapshots(observations);
  fs.writeFileSync(target,html,{flag:'wx',mode:0o600});
  const brief={schema:'evercraft.graphics-command.saban-observations.v1',
    mode:'private_local_sampled_snapshots',samples:observations.length,
    changed_adjacent_source_digests:observations.slice(1).filter((x,i)=>x.source_digest!==observations[i].source_digest).length,
    output:target,live:false,complete_event_history:false,
    publication_authority:false};
  return brief;
}
async function main(){
  const flags=process.argv.slice(2);
  const allowed=new Set(['--authorized-root','--snapshot','--review-root','--samples','--interval-ms','--prefix']);
  if(flags.length!==12||flags.some((value,i)=>i%2===0&&!allowed.has(value)))throw new Error(
    'Usage: node saban-work-observe.mjs --authorized-root ABS --snapshot ABS --review-root ABS --samples 3 --interval-ms 1000 --prefix saban-observed');
  const args=Object.fromEntries(Array.from({length:6},(_,i)=>[flags[2*i],flags[2*i+1]]));
  if(Object.keys(args).length!==6)throw new Error('All six distinct options are required');
  const options={authorizedRoot:args['--authorized-root'],snapshot:args['--snapshot'],
    reviewRoot:args['--review-root'],samples:Number(args['--samples']),
    intervalMs:Number(args['--interval-ms']),prefix:args['--prefix']};
  process.stdout.write(JSON.stringify(await captureLocalSabanObservations(options))+'\n');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main().catch(error=>{process.stderr.write(error.message+'\n');process.exitCode=1;});
