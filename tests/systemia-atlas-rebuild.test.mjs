import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ATLAS_SCHEMA, AUTHORITY, LOAD_STAGES, DOCUMENT_TYPES, createDemoWorkspace,
  evaluateLoad, getDashboard, addDemoLoad, setDemoCarrierReview,
  setDocument, setException, transitionLoad, validateWorkspace
} from '../public/apps/systemia-atlas/atlas-core.mjs';

test('the workspace declares synthetic training authority and sample data only',()=>{
 const w=createDemoWorkspace();assert.equal(w.schema,ATLAS_SCHEMA);assert.equal(w.authority,AUTHORITY);
 assert.equal(validateWorkspace(w),true);
 assert.ok(w.loads.every(x=>x.id.startsWith('SIM-')));
 assert.equal(getDashboard(w).notAccountingOrRevenue,true);
});
test('a load can be created without mutating the original and margin is illustrative',()=>{
 const w=createDemoWorkspace(),r=addDemoLoad(w,{shipperId:'S-01',carrierId:'C-02',origin:'A',destination:'B',rate:1200,cost:950});
 assert.equal(w.loads.length,2);assert.equal(r.workspace.loads.length,3);
 assert.equal(evaluateLoad(r.workspace,r.loadId).estimatedGrossMargin,250);
 assert.equal(evaluateLoad(r.workspace,r.loadId).isVerified,false);
});
test('load lifecycle follows a bounded stage machine',()=>{
 let w=createDemoWorkspace();
 assert.deepEqual(LOAD_STAGES,['draft','quoted','booked','in_transit','delivered','closed']);
 assert.equal(DOCUMENT_TYPES.length,3);
 assert.throws(()=>transitionLoad(w,'SIM-002','closed'),/Illegal/);
 w=transitionLoad(w,'SIM-002','quoted');
 assert.throws(()=>transitionLoad(w,'SIM-002','booked'),/carrier-review/);
 w=setDemoCarrierReview(w,'C-02','sample_attestation');
 w=transitionLoad(w,'SIM-002','booked');
 assert.throws(()=>transitionLoad(w,'SIM-002','in_transit'),/Rate confirmation and BOL/);
 w=setDocument(w,'SIM-002','rate_confirmation',true);
 w=setDocument(w,'SIM-002','bill_of_lading',true);
 w=transitionLoad(w,'SIM-002','in_transit');
 w=transitionLoad(w,'SIM-002','delivered');
 assert.throws(()=>transitionLoad(w,'SIM-002','closed'),/POD and resolved exceptions/);
 w=setDocument(w,'SIM-002','proof_of_delivery',true);
 const x=w.loads.find(x=>x.id==='SIM-002').exceptions[0];
 w=setException(w,'SIM-002',x.id,false);
 w=transitionLoad(w,'SIM-002','closed');
 assert.equal(w.loads.find(x=>x.id==='SIM-002').stage,'closed');
 assert.throws(()=>setDocument(w,'SIM-002','proof_of_delivery',false),/immutable/);
});
test('document checklist is NOT uploaded proof',()=>{
 const w=createDemoWorkspace(),r=setDocument(w,'SIM-001','bill_of_lading',true);
 assert.equal(w.loads[0].documents.bill_of_lading,false);
 assert.equal(r.loads[0].documents.bill_of_lading,true);
 assert.match(r.audit[0].detail,/no file uploaded or verified/);
 assert.throws(()=>setDocument(w,'SIM-001','licence',true),/Invalid document/);
});
test('exception holds are explicit and auditable',()=>{
 let w=createDemoWorkspace();
 w=setException(w,'SIM-001','Late pickup scenario');
 assert.equal(evaluateLoad(w,'SIM-001').openExceptions,1);
 const id=w.loads[0].exceptions[0].id;
 w=setException(w,'SIM-001',id,false);
 assert.equal(evaluateLoad(w,'SIM-001').openExceptions,0);
 assert.equal(w.audit[0].type,'exception_resolved');
});
test('bad and financially invalid inputs fail closed',()=>{
 const w=createDemoWorkspace();
 const base={shipperId:'S-01',carrierId:'C-01',origin:'Yakima',destination:'Seattle',rate:100,cost:50};
 assert.throws(()=>addDemoLoad(w,{...base,rate:Infinity}),/finite/);
 assert.throws(()=>addDemoLoad(w,{...base,origin:'Yakima',destination:'Yakima'}),/differ/);
 assert.throws(()=>addDemoLoad(w,{...base,shipperId:'REAL'}),/demo shipper/);
 assert.throws(()=>setDemoCarrierReview(w,'C-01','officially_verified'),/Invalid/);
 assert.throws(()=>transitionLoad(w,'SIM-900','quoted'),/Unknown load/);
});
test('dashboard counts are explicit sample estimates, not revenue or sourced carrier data',()=>{
 const w=createDemoWorkspace(),d=getDashboard(w);
 assert.equal(d.loads,2);assert.equal(d.active,1);
 assert.equal(d.estimatedGrossMargin,770);
 assert.equal(d.scope,'synthetic_demo_only');
 assert.ok(d.alerts>0);
 assert.equal(w.carriers[0].review,'sample_attestation');
});
