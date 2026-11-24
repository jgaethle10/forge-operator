import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runDiscovery} from './buyer-discovery-cycle.mjs';
import {checkpointCycle} from './buyer-discovery-checkpoint.mjs';
const now=new Date('2026-11-24T21:00:00Z');
const candidate={candidate_ref:'nyc:123',source_url:'https://example.org/solicitation/123',buyer:'Synthetic agency',title:'Video production',deadline_local:'2026-12-01T12:00:00',deadline_timezone:'America/New_York',suggested_lane:'media',stage:'research_required',qualified:false,contact_authorized:false};
const source=(candidates=[candidate])=>({key:'nyc',enabled:true,collect:async()=>({schema:'evercraft.kaidance.buyer-source-receipt.v1',records_observed:candidates.length,candidates,qualified_count:0,send_performed:false,coverage_complete:false})});
test('isolates unavailable and failed sources; deduplicates valid observations',async()=>{
 const r=await runDiscovery({now,sources:[source([candidate,candidate]),{key:'sam',enabled:false},{key:'other',enabled:true,collect:async()=>{throw Error('synthetic');}}]});
 assert.equal(r.unique_candidates,1);assert.deepEqual(r.sources.map(s=>s.state),['observed','unconfigured','held']);assert.equal(r.send_performed,false);
});
test('rejects an entire source batch if contact authority is asserted',async()=>{
 const r=await runDiscovery({now,sources:[source([candidate,{...candidate,contact_authorized:true}])]});
 assert.equal(r.unique_candidates,0);assert.equal(r.sources[0].state,'held');
});
test('retains candidates across cycles and does not recount them',async(t)=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'buyer-checkpoint-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const a=await checkpointCycle({directory,now,sources:[source()]});
 const b=await checkpointCycle({directory,now:new Date(+now+300000),sources:[source()]});
 const c=await checkpointCycle({directory,now:new Date(+now+600000),sources:[source([])]});
 assert.equal(a.new_candidates,1);assert.equal(b.new_candidates,0);assert.equal(b.reobserved_candidates,1);assert.equal(c.retained_candidates,1);
 const file=path.join(directory,'checkpoint.json');const state=JSON.parse(fs.readFileSync(file,'utf8'));
 assert.equal(state.records[0].first_seen_at,now.toISOString());assert.equal(state.records[0].last_seen_at,new Date(+now+300000).toISOString());assert.equal(fs.statSync(file).mode&0o777,0o600);
 assert.equal(c.crm_write_performed,false);assert.equal(c.send_performed,false);
});
test('exclusive lock and corrupt checkpoint prevent collection',async(t)=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'buyer-checkpoint-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 let called=0;const sources=[{key:'nyc',enabled:true,collect:async()=>{called++;throw Error('unexpected');}}];
 const lock=path.join(directory,'cycle.lock');fs.writeFileSync(lock,'held',{mode:0o600});
 await assert.rejects(checkpointCycle({directory,now,sources}),{code:'EEXIST'});
 fs.unlinkSync(lock);fs.writeFileSync(path.join(directory,'checkpoint.json'),'invalid',{mode:0o600});
 await assert.rejects(checkpointCycle({directory,now,sources}));assert.equal(called,0);assert.equal(fs.existsSync(lock),false);
});
