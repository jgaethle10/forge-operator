#!/usr/bin/env node
// KAIDANCE -> source-bound review -> deterministic candidate -> red/green proof.
// This command has no GitHub writer, remote deployer or shell command input.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runKaidanceSourceRepairCandidate} from './kaidance-source-patch-candidate.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const arg=key=>{const i=process.argv.indexOf(key);return i<0?'':process.argv[i+1]||''};
const out=arg('--out')||process.env.SYSTEMIA_KAIDANCE_CODE_CANDIDATE_OUT_DIR||
 path.join(root,'artifacts/kaidance-source-candidate');
const review=arg('--review')||
 path.join(root,'artifacts/kaidance-worlds-saban-review/latest.json');
try{
 const {report}=runKaidanceSourceRepairCandidate({root,outDir:path.resolve(out),
  reviewFile:path.resolve(review)});
 console.log(JSON.stringify({
  schema:'evercraft.kaidance.source-patch-cycle.v1',
  ok:!report.state.startsWith('hold_'),state:report.state,
  newly_proven:report.new_verified_candidate_this_cycle,
  red_green_verified:report.red_green_proof,
  proposed_candidate_digest:report.candidate_digest,
  code_changes_to_main:0,prs_created:0
 }));
 if(report.state.startsWith('hold_'))process.exitCode=1;
}catch(error){
 console.error(JSON.stringify({schema:'evercraft.kaidance.source-patch-cycle.v1',
  ok:false,reason:String(error?.message||error).slice(0,140),
  github_write_authorized:false}));
 process.exitCode=1;
}
