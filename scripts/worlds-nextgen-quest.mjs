#!/usr/bin/env node
// Adult/operator-only Evercraft Worlds NextGen local inference pilot.
// This CLI runs on the SAME Evercraft computer as an owned, loopback llama-server.
// No hosted model, no public HTTP listener, no world writes, no shell tool dispatch.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {initialWorld} from '../public/worlds/world-core.mjs';
import {generateOwnedQuest} from '../systemia/worlds/quest-model-planner.mjs';
import {makeLocalLlamaTutor} from '../systemia/classroom/tutor-runtime.mjs';

const here=fileURLToPath(import.meta.url);
function option(flag){const p=process.argv.indexOf(flag);return p>=0?process.argv[p+1]||'':'';}
function hold(reason){
 // Deliberately no raw model output, prompts, tokens or personal information.
 process.stderr.write(JSON.stringify({state:'held',reason:String(reason)})+'\n');
 process.exitCode=1;
}
export async function createLocalQuestFile({theme,origin='http://127.0.0.1:8080',output,backend}={}) {
 if(typeof output!=='string'||!path.isAbsolute(output)||path.extname(output)!=='.json')
  throw Error('quest_output_absolute_json_path_required');
 // The existing validated llama adapter refuses non-loopback origins.
 const selected=backend||makeLocalLlamaTutor({origin});
 const generated=await generateOwnedQuest({backend:selected,world:initialWorld(),theme});
 // wx is exclusive; avoid losing an existing quest or following a final-file symlink.
 // A model reply is NEVER written to disk unless it passes the strict proposal validator.
 await fs.writeFile(output,JSON.stringify(generated.proposal,null,2)+'\n',{flag:'wx',mode:0o600});
 return {state:'proposal_created',output,receipt:generated.receipt};
}
if(process.argv[1]&&path.resolve(process.argv[1])===here){
 if(!process.argv.includes('--execute')){
  hold('explicit_execute_required');
 }else{
  createLocalQuestFile({
   theme:option('--theme'),origin:option('--llama-origin')||'http://127.0.0.1:8080',
   output:option('--output')
  }).then(result=>{process.stdout.write(JSON.stringify(result)+'\n');})
  .catch(error=>hold(error?.message||'quest_proposal_unavailable'));
 }
}
