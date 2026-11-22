// KAIDANCE source-patch micro-adapter: a single, deterministic, source-bound
// repair recipe. Never consumes arbitrary model-authored commands or paths.
// Any wider AI authoring must use a separately sandboxed, reviewed adapter.
import {createHash} from 'node:crypto';
export const REPAIR_ID='worlds-mossmere-agent-position-finite-v1';
export const SOURCE_PATH='public/worlds/world-core.mjs';
export const TEST_PATH='tests/world-core.test.mjs';
export const PRECONDITION="if(!a||a.id!==expected[i]||typeof a.name!=='string'||a.name.length>40||!Array.isArray(a.memories)||a.memories.length>8||a.memories.some(m=>typeof m!=='string'||m.length>160))throw Error('Invalid inhabitant data');";
export const REPLACEMENT="if(!a||a.id!==expected[i]||typeof a.name!=='string'||a.name.length>40||!Number.isFinite(a.x)||!Number.isFinite(a.z)||Math.abs(a.x)>17||Math.abs(a.z)>17||!Array.isArray(a.memories)||a.memories.length>8||a.memories.some(m=>typeof m!=='string'||m.length>160))throw Error('Invalid inhabitant data');";
export const TEST_ANCHOR="test('import rejects malicious or unbounded agent memories',()=>{";
export const REGRESSION=[
 "test('inhabitant coordinates reject non-finite and out-of-bounds saved values',()=>{",
 " for(const field of ['x','z']){",
 "  for(const value of [NaN,Infinity,-Infinity,17.01,-17.01]){",
 "   const world=initialWorld();",
 "   world.agents[0][field]=value;",
 "   assert.throws(()=>validateWorld(world),/Invalid inhabitant data/);",
 "  }",
 " }",
 " const storageObject=storage(),tampered=initialWorld();",
 " tampered.agents[1].x=18;",
 " storageObject.setItem(STORAGE_KEY,JSON.stringify(tampered));",
 " assert.deepEqual(loadWorld(storageObject),initialWorld());",
 "});",
].join('\n')+'\n';
const hash=s=>'sha256:'+createHash('sha256').update(String(s)).digest('hex');
const sha=s=>createHash('sha256').update(String(s)).digest('hex');
const count=(s,n)=>s.split(n).length-1;
export function planMossmereSourceRepair({sourceText,testText,sourceFingerprint,review}={}){
 if(typeof sourceText!=='string'||typeof testText!=='string'||
  Buffer.byteLength(sourceText)>100000||Buffer.byteLength(testText)>100000)
  throw Error('kaidance_source_repair_invalid_source_bounds');
 if(!/^sha256:[a-f0-9]{64}$/.test(sourceFingerprint||''))
  throw Error('kaidance_source_repair_missing_source_fingerprint');
 // Review is a prerequisite for a proposal, but an unsigned CI JSON file
 // does not itself grant GitHub branch-write permission.
 if(review?.schema!=='evercraft.kaidance.saban-world-review.v1'||
   review.source_fingerprint!==sourceFingerprint||
   review.state!=='complete'||review.local_readonly_completed!==true||
   review.execution_receipt_verified!==true||
   !Array.isArray(review.receipt_refs)||!review.receipt_refs.some(x=>/^sha256:[a-f0-9]{64}$/.test(x)))
  throw Error('kaidance_source_repair_verified_review_required');
 const base={schema:'evercraft.kaidance.source-repair-candidate.v1',
  repair_id:REPAIR_ID,review_goal_key:review.goal_key,
  reviewed_source_fingerprint:sourceFingerprint,
  source_path:SOURCE_PATH,test_path:TEST_PATH,
  base_source_sha256:hash(sourceText),base_test_sha256:hash(testText),
  production_mutations:0,git_branch_created:false,pr_opened:false,
  publisher_authority_granted:false,code_execution_authority_granted:false};
 if(count(sourceText,REPLACEMENT)===1&&count(sourceText,PRECONDITION)===0)
  return {...base,state:'no_change_required',changed_files:[],
   new_source_text:null,new_test_text:null,proof_required:false};
 if(count(sourceText,PRECONDITION)!==1||count(sourceText,REPLACEMENT)!==0||
    count(testText,TEST_ANCHOR)!==1||testText.includes(REGRESSION.trim()))
  return {...base,state:'hold_source_anchor_drift',changed_files:[],
   new_source_text:null,new_test_text:null,proof_required:false};
 const newSource=sourceText.replace(PRECONDITION,REPLACEMENT);
 const newTest=testText.replace(TEST_ANCHOR,REGRESSION+TEST_ANCHOR);
 const contentDigest=hash(JSON.stringify({source:newSource,test:newTest,repair:REPAIR_ID}));
 return {...base,state:'candidate_proposed',changed_files:[SOURCE_PATH,TEST_PATH],
  new_source_text:newSource,new_test_text:newTest,
  new_source_sha256:hash(newSource),new_test_sha256:hash(newTest),
  candidate_digest:contentDigest,
  deterministic_branch:'kaidance/source-repair-'+sha(REPAIR_ID+'|'+sourceFingerprint).slice(0,24),
  proof_required:true};
}
