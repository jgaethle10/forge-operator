#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {planPublicDemandResearch} from './public-demand-intake.mjs';
import {runPublicDemandGoal} from './public-demand-durable.mjs';
import {startNativeBrowserRuntime} from '../evercraft-web/browser-worker/native-runtime.mjs';

export async function runPublicDemandBatch({directory,hits,browse}={}){
 if(!Array.isArray(hits)||hits.length<1||hits.length>3||typeof browse!=='function')throw Error('invalid_batch_bounds');
 const plan=planPublicDemandResearch({hits,limit:3});
 const results=[];
 for(const job of plan.jobs){
  try{results.push(await runPublicDemandGoal({directory,job,browse}));}
  catch{results.push({source_url:job.source_url,goal_state:'hold_operator_reconciliation',qualified:false,send_performed:false});}
 }
 return {schema:'evercraft.public-demand.batch-run.v1',input_count:hits.length,admitted:plan.jobs.length,rejected:plan.held,results,captured:results.filter(x=>x.capture_state==='captured_requires_research').length,held:results.filter(x=>x.capture_state!=='captured_requires_research').length,qualified_count:0,send_performed:false};
}
async function main(){
 const [input,directory,sourceDir,browsersPath]=process.argv.slice(2);
 if(process.argv.length!==6||![input,directory,sourceDir,browsersPath].every(x=>x&&path.isAbsolute(x)))throw Error('four_absolute_paths_required');
 const fd=fs.openSync(input,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
 let hits;
 try{
  const st=fs.fstatSync(fd);
  if(!st.isFile()||st.uid!==process.getuid()||(st.mode&0o077)!==0||st.size>65536)throw Error('unsafe_batch_input');
  hits=JSON.parse(fs.readFileSync(fd,'utf8'));
 }finally{fs.closeSync(fd);}
 if(!Array.isArray(hits)||hits.length<1||hits.length>3)throw Error('invalid_batch_bounds');
 const runtime=await startNativeBrowserRuntime({sourceDir,browsersPath,maxConcurrency:1});
 try{console.log(JSON.stringify(await runPublicDemandBatch({directory,hits,browse:request=>runtime.browse(request)}),null,2));}
 finally{await runtime.close();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===new URL(import.meta.url).pathname)main().catch(()=>{console.error('public_demand_batch_failed');process.exitCode=1;});
