import test from 'node:test';
import assert from 'node:assert/strict';
import {operatorPilotReceipt,offlineProof} from '../pilot-check.mjs';

const stubFiles=['public-discovery.test.mjs','independent-tool.test.mjs','reviewed-bridge.test.mjs','pilot-check.test.mjs'];
function fakeRunner({status=0,stdout='# tests 20\n# pass 20\n# fail 0\n',signal=null,error=null}={}){
 return ()=>({status,stdout,signal,error});
}
test('external operator offline pilot returns a clean, non-authorizing receipt',async()=>{
 const r=await operatorPilotReceipt('offline',{
   offline:()=>offlineProof({exec:fakeRunner(),reader:()=>stubFiles}),
   clock:()=>new Date('2026-10-17T22:00:00.000Z')
 });
 assert.equal(r.ok,true);
 assert.equal(r.mode,'offline');
 assert.equal(r.generated_at,'2026-10-17T22:00:00.000Z');
 assert.equal(r.result.tests_passed,20);
 assert.equal(r.self_reported_by_human,false);
 assert.equal(r.independent_contributor_identity_verified,false);
 assert.ok(Object.values(r.claims).every(v=>v===false));
 assert.equal('hostname' in r,false);
 assert.equal('credential' in r,false);
});
test('offline proof rejects missing test coverage, skipped results and non-zero runner',()=>{
 const common={reader:()=>stubFiles};
 assert.throws(()=>offlineProof({...common,exec:fakeRunner({status:1})}),/failed/);
 assert.throws(()=>offlineProof({...common,exec:fakeRunner({stdout:'# tests 20\n# pass 19\n# fail 1\n'})}),/incomplete/);
 assert.throws(()=>offlineProof({...common,exec:fakeRunner({stdout:'# tests 18\n# pass 18\n# fail 0\n'})}),/incomplete/);
 assert.throws(()=>offlineProof({...common,reader:()=>['only.test.mjs'],exec:fakeRunner()}),/missing/);
});
test('online operator receipt accepts only independently verified read-only remote Fabric',async()=>{
 const r=await operatorPilotReceipt('live',{live:async()=>({
   state:'read_only_public_discovery_verified',observed_at:'2026-10-17T22:00:00.000Z',
   origin:'https://fabric.systemiacommandcenters.com',
   server_name:'evercraft-fabric',available_read_only_tools:['match_evercraft_capability'],
   matched_public_id:'findmypart-paid-hunt-v1',
   human_offer_url:'https://fabric.systemiacommandcenters.com/offers/findmypart',
   verified_payment:false,checkout_created:false,
 })});
 assert.equal(r.ok,true);
 assert.equal(r.result.read_only,true);
 assert.equal(r.claims.public_tool_invoked,false);
 assert.equal(r.claims.provider_payment_verified,false);
});
test('online readback cannot manufacture proof on missing identity or unexpected paid state',async()=>{
 const inputs=[
   {server_name:'lookalike'},
   {verified_payment:true},
   {checkout_created:true},
   {state:'not_verified'},
   {matched_public_id:'wrong'},
 ];
 const base={state:'read_only_public_discovery_verified',server_name:'evercraft-fabric',
 matched_public_id:'findmypart-paid-hunt-v1',verified_payment:false,checkout_created:false};
 for(const change of inputs){
   const r=await operatorPilotReceipt('live',{live:async()=>({...base,...change})});
   assert.equal(r.ok,false);assert.equal(r.error_code,'verification_failed');
   assert.equal(r.result,null);
 }
});
test('failure reports expose bounded error category rather than raw remote details',async()=>{
 const secret='do-not-print-this-private-token';
 const r=await operatorPilotReceipt('live',{live:async()=>{throw Error('fetch failed: '+secret)}});
 assert.equal(r.ok,false);assert.equal(r.error_code,'network_unavailable');
 assert.doesNotMatch(JSON.stringify(r),new RegExp(secret));
 assert.throws(()=>offlineProof({reader:()=>[],exec:fakeRunner()}),/missing/);
});
test('unknown mode cannot turn this into a command executor',async()=>{
 await assert.rejects(()=>operatorPilotReceipt('deploy'),/Choose --offline or --live/);
});
