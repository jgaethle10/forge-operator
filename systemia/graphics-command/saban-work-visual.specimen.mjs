// Synthetic, first-party Saban state-machine visual specimen. CI-only artifact.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createWorkState,leaseNext,complete,fail,checkpoint} from '../saban/work-state.mjs';
import {buildSabanWorkProof} from './saban-work-visual.mjs';

const now=Date.parse('2026-11-09T18:00:00.000Z');
const assignments=Array.from({length:20},(_,i)=>({
  agent_id:'synthetic-agent-'+String(i+1).padStart(2,'0'),
  role:'simulated-role',work:{kind:'synthetic_sample',key:'fixture-'+i}
}));
const state=createWorkState({softwareId:'synthetic-office-demo',assignments,createdAt:now});
for(let i=0;i<16;i++){
  const worker='synthetic-worker-'+i;
  const job=leaseNext(state,{workerId:worker,now:now+1000+i*1000});
  if(!job)throw new Error('Expected synthetic state-machine job');
  if(i<11){
    if(i===4)checkpoint(state,{jobId:job.job_id,workerId:worker,data:{synthetic:true},now:now+1100+i*1000});
    complete(state,{jobId:job.job_id,workerId:worker,result:{synthetic:true},now:now+1500+i*1000});
  }else if(i<13){
    fail(state,{jobId:job.job_id,workerId:worker,error:{code:'synthetic_failure'},retry:false,now:now+1500+i*1000});
  }
  // Last three are leased, intentionally not presented as live.
}
const out=path.resolve(process.argv[2]||'artifacts/saban-work-visual-specimen');
fs.mkdirSync(out,{recursive:true});
const {projection,html}=buildSabanWorkProof(JSON.stringify(state),{mode:'synthetic_test'});
if(projection.counts.completed!==11||projection.counts.dead_letter!==2||
   projection.counts.leased!==3||projection.counts.queued!==4){
  throw new Error('Synthetic specimen does not match Saban state transitions');
}
const rendered=path.join(out,'saban-state-synthetic.html');
fs.writeFileSync(rendered,html);
const receipt={schema:'evercraft.graphics-command.saban-work-visual-specimen.v1',
  source_class:'synthetic_test',total:projection.total_jobs,counts:projection.counts,
  source_digest:projection.source_digest,
  rendered_sha256:'sha256:'+crypto.createHash('sha256').update(html).digest('hex'),
  publishable:false,live_worker_execution:false,private_data_embedded:false};
fs.writeFileSync(path.join(out,'specimen-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt));
