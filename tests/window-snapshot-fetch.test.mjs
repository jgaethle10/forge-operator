import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fetchWindowSnapshot} from '../systemia/society/window-snapshot-fetch.mjs';
import {advanceHeartbeat,STATE_SCHEMA} from '../systemia/society/window-heartbeat.mjs';
import {PUBLIC_GENESIS_MS,REAL_TICK_MS} from '../public/the-window/world.mjs';

const COMMIT='9'.repeat(40),API='https://api.github.com/repos/jgaethle10/forge-operator';
const original=advanceHeartbeat({
  schema:STATE_SCHEMA,initialized:false,release_status:'held'
},PUBLIC_GENESIS_MS+110*REAL_TICK_MS).state;

function fixture({state=original,sha=null,path='state/window.json',encoding='base64',status=200}={}){
  const bytes=Buffer.from(JSON.stringify(state)+'\n','utf8');
  const blob=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
  const ref={ref:'refs/heads/window-society-state',object:{type:'commit',sha:COMMIT}};
  const file={type:'file',path,encoding,size:bytes.length,sha:sha||blob,content:bytes.toString('base64')};
  const calls=[];
  const fetchImpl=async(url,options)=>{
    calls.push({url,options});
    if(url===API+'/git/ref/heads/window-society-state')return {ok:true,json:async()=>ref};
    if(url===API+'/contents/state/window.json?ref='+COMMIT)return {ok:status===200,json:async()=>file};
    throw Error('Unexpected URL: '+url);
  };
  return {fetchImpl,calls,ref,file,bytes};
}
test('fetches exact GitHub state commit, validates blob and saved world, never writes',async()=>{
 const source=fixture();
 const before=JSON.stringify(original);
 const result=await fetchWindowSnapshot({fetchImpl:source.fetchImpl,observedAt:'2026-11-10T00:00:00.000Z'});
 assert.equal(result.schema,'evercraft.window.private-observation.v1');
 assert.equal(result.model_mode,'civic_and_social_policy_no_llm');
 assert.equal(result.release_status,'held');
 assert.equal(result.source_fetch.commit_sha,COMMIT);
 assert.equal(result.source_fetch.blob_sha,source.file.sha);
 assert.equal(result.source_fetch.observed_at,'2026-11-10T00:00:00.000Z');
 assert.equal(result.source_fetch.assertion,'git_blob_and_world_content_consistency_not_signed_attestation');
 assert.equal(result.observation_created_from.world_hash,original.world_hash);
 assert.equal(result.decision_projection.execution_mode,'deterministic_rules_no_llm');
 assert.ok(result.decision_projection.receipts.length>0);
 assert.deepEqual(source.calls.map(x=>x.url),[
  API+'/git/ref/heads/window-society-state',
  API+'/contents/state/window.json?ref='+COMMIT
 ]);
 assert.ok(source.calls.every(x=>x.options.method==='GET'&&x.options.redirect==='error'));
 assert.ok(source.calls.every(x=>!('Authorization' in x.options.headers)));
 assert.equal(JSON.stringify(original),before);
});
test('wrong ref and type fail before requesting state bytes',async()=>{
 for(const bad of [
  {ref:'refs/heads/main',object:{type:'commit',sha:COMMIT}},
  {ref:'refs/heads/window-society-state',object:{type:'tag',sha:COMMIT}},
  {ref:'refs/heads/window-society-state',object:{type:'commit',sha:'wrong'}}
 ]){
  let calls=0;
  await assert.rejects(()=>fetchWindowSnapshot({
   fetchImpl:async()=>{calls++;return {ok:true,json:async()=>bad};}
  }),/Canonical state branch reference mismatch/);
  assert.equal(calls,1);
 }
});
test('rejects malicious bytes, wrong Git blob and unexpected file metadata',async()=>{
 const wrongHash=fixture({sha:'f'.repeat(40)});
 await assert.rejects(()=>fetchWindowSnapshot({fetchImpl:wrongHash.fetchImpl}),/Git object hash mismatch/);
 const wrongPath=fixture({path:'other.json'});
 await assert.rejects(()=>fetchWindowSnapshot({fetchImpl:wrongPath.fetchImpl}),/Invalid pinned state file metadata/);
 const remoteFailure=fixture({status:404});
 await assert.rejects(()=>fetchWindowSnapshot({fetchImpl:remoteFailure.fetchImpl}),/unavailable/);
 const invalid=fixture();invalid.file.content='!!!';
 await assert.rejects(()=>fetchWindowSnapshot({fetchImpl:invalid.fetchImpl}),/Invalid encoded state file/);
});
test('Git object integrity does not permit world-hash tampering or invented LLM claims',async()=>{
 const manipulated=structuredClone(original);
 manipulated.world.actors[0].coins+=99;
 const tampered=fixture({state:manipulated});
 await assert.rejects(()=>fetchWindowSnapshot({fetchImpl:tampered.fetchImpl}),/world hash mismatch/);
 const falseLLM=structuredClone(original);
 falseLLM.model_mode='autonomous_llm';
 const wrongMode=fixture({state:falseLLM});
 await assert.rejects(()=>fetchWindowSnapshot({fetchImpl:wrongMode.fetchImpl}),/Unsupported model-mode/);
});
