// Purely synthetic offline Graphics QA specimen generated from canonical Saban transitions.
// No actual Evercraft customer or node state is shipped into CI artifacts.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createWorkState,leaseNext,complete,fail} from '../saban/work-state.mjs';
import {projectSabanWorkProof} from './saban-work-visual.mjs';
import {classifySnapshotClock} from './saban-work-operator.mjs';
import {renderObservedSnapshots} from './saban-work-observe.mjs';

const started=Date.parse('2026-11-10T20:19:00.000Z');
const assign=Array.from({length:24},(_,i)=>({
  agent_id:'synthetic-agent-'+i,role:'synthetic',
  work:{kind:'fixture',key:'public-fake-'+i}
}));
const state=createWorkState({softwareId:'fictional-test-work',assignments:assign,createdAt:started});
const observations=[];
for(let sample=0;sample<3;sample++){
  if(sample>0){
    for(let i=0;i<sample*4+3;i++){
      const worker='fake-worker-'+sample+'-'+i;
      const j=leaseNext(state,{workerId:worker,now:started+sample*60000+i*1000});
      if(!j)break;
      if(i%7===0){
        fail(state,{jobId:j.job_id,workerId:worker,retry:false,error:{code:'fictional_error'},
          now:started+sample*60000+i*1000+200});
      }else{
        complete(state,{jobId:j.job_id,workerId:worker,result:{test_only:true},
          now:started+sample*60000+i*1000+200});
      }
    }
  }
  const projection=projectSabanWorkProof(JSON.stringify(state),{mode:'synthetic_test'});
  observations.push({
    source_digest:projection.source_digest,total_jobs:projection.total_jobs,
    counts:projection.counts,clock:classifySnapshotClock(projection.snapshot_at,
      {now:started+sample*60000+500}),live:false,publication_authority:false
  });
}
const html=renderObservedSnapshots(observations,{sourceClass:'synthetic_test'});
if(observations.length!==3||observations[0].counts.completed!==0||
   observations.at(-1).counts.completed<=0||!html.includes('SYNTHETIC TEST DATA')){
  throw new Error('Synthetic Saban specimen guard failed');
}
const output=path.resolve(process.argv[2]||'artifacts/saban-work-visual-specimen');
fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(path.join(output,'saban-observations-synthetic.html'),html);
const receipt={schema:'evercraft.graphics-command.saban-sampled-specimen.v1',
  synthetic_test:true,private_node_access:false,complete_event_history:false,
  observations:observations.map(({counts,total_jobs,clock})=>({
    counts,total_jobs,observed_at:clock.observed_at})),
  rendered_sha256:'sha256:'+crypto.createHash('sha256').update(html).digest('hex'),
  publication_authority:false};
fs.writeFileSync(path.join(output,'saban-observations-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt));
