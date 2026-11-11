import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createClassroomTutor,CLASSROOM_ROOMS} from '../systemia/classroom/tutor-core.mjs';

let seq=0;const id=()=>String(++seq).padStart(40,'x');
function fixture({reply='Let us explore an example. What would you like to try first?', now=()=>Date.now()}={}){
 const calls=[];
 const tutor=createClassroomTutor({
  newId:id,now,
  infer:async payload=>{
   calls.push(payload);
   return {status:'completed',text:reply,provider:'ollama',provider_receipt:'sha256:proof-test-only'};
  }
 });
 return {tutor,calls};
}
test('Original six learning worlds are present and named correctly',()=>{
 assert.deepEqual(Object.keys(CLASSROOM_ROOMS),['math','reading','science','language','creative','calm']);
 for(const room of Object.values(CLASSROOM_ROOMS))assert(room.name&&room.discipline);
});
test('Curiosity-first prompt uses learner exact words, prior turns, actual room',async()=>{
 const {tutor,calls}=fixture();
 const session=tutor.start('math');
 const first=await tutor.say({session_id:session.session_id,message:"I don't have a problem. I just want to learn math."});
 assert.equal(first.source,'owned_local_model');assert.equal(first.no_mastery_awarded,true);
 assert.match(calls[0].prompt,/Math Cave/);
 assert.match(calls[0].prompt,/I don't have a problem\. I just want to learn math/);
 assert.match(calls[0].prompt,/If a learner says they have no homework/);
 await tutor.say({session_id:session.session_id,message:'Can we do one with marbles?'});
 assert.match(calls[1].prompt,/Can we do one with marbles\?/);
 assert.match(calls[1].prompt,/Let us explore an example/);
 assert.match(calls[1].prompt,/I don't have a problem/);
 assert.equal(tutor.status().model_safety_certified,false);
});
test('Parallel rooms keep separate dialogue transcripts and cannot cross session boundaries',async()=>{
 const {tutor,calls}=fixture();
 const a=tutor.start('reading'),b=tutor.start('science');
 await tutor.say({session_id:a.session_id,message:'I like missing key mysteries.'});
 await tutor.say({session_id:b.session_id,message:'How do seeds grow?'});
 assert.match(calls[1].prompt,/Science Sky Lab/);
 assert.doesNotMatch(calls[1].prompt,/missing key mysteries/);
 assert.throws(()=>tutor.start('unknown'),/invalid_room/);
 assert.rejects(()=>tutor.say({session_id:'made-up',message:'Hello'}),/session_not_found/);
});
test('Safety escalation does not call a model and does not award XP',async()=>{
 const {tutor,calls}=fixture();
 const s=tutor.start('calm');
 const r=await tutor.say({session_id:s.session_id,message:'Someone is hurting me at home'});
 assert.equal(r.source,'safety_boundary');
 assert.equal(r.no_mastery_awarded,true);
 assert.match(r.reply,/trusted adult/);
 assert.equal(calls.length,0);
});
test('Active homework answer leak guard holds unsafe direct answer',async()=>{
 const {tutor}=fixture({reply:'The final answer is: 42.'});
 const s=tutor.start('math');
 await assert.rejects(()=>tutor.say({session_id:s.session_id,message:'Can you solve my schoolwork for me?',homework:true}),
  /homework_answer_guard_blocked/);
 assert.equal(tutor.status().session_count,1);
});
test('Provider spoofing, failed inference and invalid input never impersonate tutor',async()=>{
 const t=createClassroomTutor({newId:id,infer:async()=>({status:'completed',text:'Sure',provider:'openai'})});
 const s=t.start('science');
 await assert.rejects(()=>t.say({session_id:s.session_id,message:'Tell me about water'}),/local_inference_unverified/);
 const down=createClassroomTutor({newId:id,infer:async()=>{throw Error('backend down')}});
 const d=down.start('math');
 await assert.rejects(()=>down.say({session_id:d.session_id,message:'Tell me about numbers'}),/local_inference_unavailable/);
 await assert.rejects(()=>down.say({session_id:d.session_id,message:'x'}),/invalid_message/);
 await assert.rejects(()=>down.say({session_id:d.session_id,message:'hello',homework:'no'}),/invalid_homework_flag/);
});
test('Sessions are short-lived, in memory only, with explicit revocation',async()=>{
 let clock=100000;
 const {tutor}=fixture({now:()=>clock});
 const a=tutor.start('math');
 assert.equal(a.context_retention,'memory_only_30_minutes');
 clock+=30*60*1000+1;
 await assert.rejects(()=>tutor.say({session_id:a.session_id,message:'Continue'}),/session_expired/);
 const b=tutor.start('reading');
 assert.equal(tutor.close(b.session_id),true);
 await assert.rejects(()=>tutor.say({session_id:b.session_id,message:'Continue'}),/session_not_found/);
});
test('Private UI has conversational input, six original saturated rooms and no hidden network provider',()=>{
 const html=fs.readFileSync(new URL('../systemia/classroom/pilot.html',import.meta.url),'utf8');
 assert.match(html,/Welcome, explorer!/);
 assert.match(html,/Reading Treehouse/);
 assert.match(html,/Science Sky Lab/);
 assert.match(html,/\.world\.math\{background:linear-gradient/);
 assert.match(html,/\.world\.calm\{background:linear-gradient/);
 assert.match(html,/This is active schoolwork/);
 assert.match(html,/Actual local model conversation/);
 assert.match(html,/data-sample="Does this really work\?"/);
 assert.match(html,/max-width:430px/);
 assert.doesNotMatch(html,/\blocalStorage\b|\bsessionStorage\b|cdn\.|base44\.app|<script\s+src/);
});
