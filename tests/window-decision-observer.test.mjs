import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {advanceHeartbeat,STATE_SCHEMA} from '../systemia/society/window-heartbeat.mjs';
import {PUBLIC_GENESIS_MS,REAL_TICK_MS} from '../public/the-window/world.mjs';
import {observeWindowSnapshot,readWindowSnapshot,OBSERVATION_SCHEMA} from '../systemia/society/window-decision-observer.mjs';

const placeholder={schema:STATE_SCHEMA,initialized:false,release_status:'held'};
const now=PUBLIC_GENESIS_MS+130*REAL_TICK_MS;
const sample=()=>{
 const first=advanceHeartbeat(placeholder,now).state;
 return advanceHeartbeat(first,now+120*REAL_TICK_MS).state;
};
test('read-only projection of canonical policy heartbeat has bounded, disclosed provenance',()=>{
 const saved=sample(),before=JSON.stringify(saved);
 const projected=observeWindowSnapshot(saved);
 assert.equal(projected.schema,OBSERVATION_SCHEMA);
 assert.equal(projected.origin,'operator_supplied_local_snapshot_not_authenticated');
 assert.equal(projected.verified,'internal_world_hash_only');
 assert.equal(projected.release_status,'held');
 assert.equal(projected.model_mode,'civic_and_social_policy_no_llm');
 assert.equal(projected.residents.length,12);
 assert.equal(projected.observation_created_from.world_hash,saved.world_hash);
 assert.equal(projected.historical_limit,'only_retained_bounded_chronicle_not_full_history');
 assert.ok(projected.decision_projection.receipts.length>0);
 assert.equal(projected.decision_projection.attestation,'content_digest_not_signature');
 assert.equal(JSON.stringify(saved),before);
 assert.ok(!JSON.stringify(projected).includes('GITHUB_TOKEN'));
});
test('tampered world or fabricated model modes fail closed',()=>{
 const a=sample();
 const altered=structuredClone(a);altered.world.actors[0].name='FAKE';
 assert.throws(()=>observeWindowSnapshot(altered),/hash mismatch/);
 const unsupported=structuredClone(a);unsupported.model_mode='llm_autonomous';
 assert.throws(()=>observeWindowSnapshot(unsupported),/Unsupported model-mode/);
 const wrong=structuredClone(a);wrong.world.events=[{id:'e999999999999',source:'social_policy_v1'}];
 wrong.world_hash=createHash('sha256').update(JSON.stringify(wrong.world)).digest('hex');
 assert.throws(()=>observeWindowSnapshot(wrong),/Future Window event/);
});
test('local snapshot reader refuses oversized JSON and accepts a genuine snapshot file',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'window-observer-test-'));
 try{
   const file=path.join(dir,'window.json');
   const saved=sample();
   await fs.writeFile(file,JSON.stringify(saved));
   const projection=await readWindowSnapshot(file);
   assert.equal(projection.observation_created_from.sequence,saved.sequence);
   await fs.writeFile(file,'x'.repeat(1_000_001));
   await assert.rejects(()=>readWindowSnapshot(file),/under 1MB/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
