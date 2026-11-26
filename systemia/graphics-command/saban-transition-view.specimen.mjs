// Synthetic-only CI specimen. Never put a private operator journal in artifacts.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {createWorkState} from '../saban/work-state.mjs';
import {runScheduler} from '../saban/scheduler.mjs';
import {createPrivateSabanTransitionJournal} from './saban-transition-journal.mjs';
import {createPrivateTransitionReview} from './saban-transition-view.mjs';

const home=fs.mkdtempSync(path.join(os.tmpdir(),'saban-graphics-timeline-'));
const dir=path.join(home,'private-journal');
const out=path.resolve(process.argv[2]||'artifacts/saban-work-visual-specimen');
const sourceClass='synthetic_test';
const privateLabel='synthetic_only_test';
let journal;
try{
  journal=createPrivateSabanTransitionJournal({directory:dir,sourceClass});
  const state=createWorkState({softwareId:privateLabel,maxAttempts:1,
    assignments:Array.from({length:12},(_,i)=>({
      agent_id:'fixture-agent-'+i,role:'fixture',
      work:{kind:'fixture',key:'index-'+i},item:{fictional:true}
    }))});
  const receipt=await runScheduler({state,physicalWorkers:3,
    adapter:{async runAssignment({assignment}){
      if(assignment.work.key==='index-3'||assignment.work.key==='index-7')
        throw new Error('deliberate synthetic failure');
      return {synthetic_ok:true};
    }},
    onStateObservation:journal.record});
  journal.close();
  if(receipt.observation_summary.failures!==0||
     receipt.summary.counts.completed!==10||receipt.summary.counts.dead_letter!==2)
    throw new Error('Synthetic Saban transition specimen disagrees with scheduler');
  const review=createPrivateTransitionReview({directory:dir});
  fs.mkdirSync(out,{recursive:true});
  const html=fs.readFileSync(review.output,'utf8');
  const target=path.join(out,'saban-transitions-synthetic.html');
  fs.writeFileSync(target,html);
  const proof={
    schema:'evercraft.graphics-command.saban-transition-visual-specimen.v1',
    source_class:sourceClass,scheduler_observed_events:journal.summary().entries,
    source_kind:'private_synthetic_scheduler_run',
    printed_html_sha256:'sha256:'+crypto.createHash('sha256').update(html).digest('hex'),
    completed_jobs:10,failed_jobs:2,
    private_journal_in_artifact:false,independently_attested:false,
    publication_authority:false
  };
  fs.writeFileSync(path.join(out,'saban-transitions-receipt.json'),JSON.stringify(proof,null,2)+'\n');
  process.stdout.write(JSON.stringify(proof)+'\n');
}finally{
  journal?.close();
  fs.rmSync(home,{recursive:true,force:true});
}
