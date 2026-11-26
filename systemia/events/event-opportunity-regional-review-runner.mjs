#!/usr/bin/env node
// Offline, human-reviewed regional bid intake. Same KAIDANCE workflow, no new
// scheduler, no automated portal scraping, no external contact or spend.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {reviewRegionalEventCandidates} from './event-opportunity-regional-review.mjs';
const root=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const source='systemia/events/regional-official-notices.review.v1.json';
function atomic(file,body){
 const dir=path.dirname(file);fs.mkdirSync(dir,{recursive:true,mode:0o700});
 if(fs.lstatSync(dir).isSymbolicLink()||(fs.existsSync(file)&&fs.lstatSync(file).isSymbolicLink()))
  throw Error('regional_output_untrusted');
 const tmp=file+'.'+process.pid+'.'+randomBytes(5).toString('hex')+'.tmp';
 try{fs.writeFileSync(tmp,JSON.stringify(body,null,2)+'\n',{mode:0o600,flag:'wx'});
  fs.renameSync(tmp,file);}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp)}
}
export function runRegionalEventReview({rootDir=root,outDir=path.join(root,'artifacts/event-opportunity-regional'),
 now=new Date()}={}){
 const at=now instanceof Date?now:new Date(now);
 if(!Number.isFinite(at.getTime()))throw Error('regional_invalid_clock');
 const f=path.resolve(rootDir,source);
 if(!f.startsWith(path.resolve(rootDir)+path.sep))throw Error('regional_source_outside_root');
 const stat=fs.lstatSync(f);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>96*1024)
  throw Error('regional_source_untrusted');
 const input=JSON.parse(fs.readFileSync(f,'utf8'));
 if(input.schema!=='evercraft.events.regional-public-notice-intake.v1'||
   input.automatic_outreach!==false||!Array.isArray(input.sources))
  throw Error('regional_source_schema_invalid');
 const observation=reviewRegionalEventCandidates(input.sources,{now:at});
 const report={schema:'evercraft.events.regional-intake-receipt.v1',
  observed_at:at.toISOString(),status:observation.candidates.length?
    'dated_manual_source_review_candidates':'no_current_manual_source_evidence',
  evidence_source:source,official_portal_live_crawl:false,
  candidate_count:observation.candidates.length,
  candidates:observation.candidates,
  external_actions:0,outreach_sent:0,bids_submitted:0,
  contracts_signed:0,revenue_earned:0,event_approvals:0};
 const state={schema:'evercraft.events.regional-intake-state.v1',
  observed_at:at.toISOString(),observation,
  source_portal_live_verified:false};
 const out=path.resolve(outDir);
 atomic(path.join(out,'latest.json'),report);
 atomic(path.join(out,'state.json'),state);
 return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const i=process.argv.indexOf('--out');
 try{const r=runRegionalEventReview({outDir:i>=0?process.argv[i+1]:undefined});
  console.log(JSON.stringify({status:r.status,candidates:r.candidate_count,
   no_automatic_outreach:true,public_portal_crawled:false}));}
 catch(e){console.error(JSON.stringify({status:'error',reason:String(e.message).slice(0,100)}));process.exitCode=1}
}
