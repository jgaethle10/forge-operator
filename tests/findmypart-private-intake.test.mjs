import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import {randomBytes,createHash} from 'node:crypto';
import {buildFindMyPartIntake} from '../systemia/mcp/findmypart-intake.mjs';
import {createFindMyPartPrivateIntakeLedger} from '../systemia/payments/findmypart-private-intake.mjs';

const key=randomBytes(32);
const base={
  part_description:'Discontinued steering column control switch with a cracked case and broken terminal on an older tractor.',
  equipment_context:'Ford 3600 tractor, 1978',part_number:'ABC1234',
  sources_tried:'The official dealer and a local salvage yard could not source it.',
  scope_confirmed:true,
};
const P={findmypart:['findmypart.quick_hunt_19.v1',1900], 'part-deep':['findmypart.deep_hunt_49.v1',4900],'part-rescue':['findmypart.rescue_hunt_99.v1',9900]};
async function setup(t,clock=()=>Date.now()){
 const stateDir=await fs.mkdtemp(path.join(os.tmpdir(),'fmp-private-ledger-'));
 t.after(()=>fs.rm(stateDir,{recursive:true,force:true}));
 return {stateDir,clock,ledger:await createFindMyPartPrivateIntakeLedger({stateDir,key,now:clock})};
}
const payload=(slug='findmypart',order_key='buyer-1234567890123',customer_email='buyer@example.com')=>{
 const {intake,intake_digest}=buildFindMyPartIntake(base,{slug,customerEmail:customer_email});
 return {action:'findmypart_prepayment_preflight',order_key,customer_email,
   offer_key:P[slug][0],intake,intake_digest,checkout_created:false};
};
test('encrypts personally supplied part brief at rest, with private permissions',async(t)=>{
 const {stateDir,ledger}=await setup(t);
 const request=payload();
 const ack=await ledger.preflight(request);
 assert.equal(ack.ok,true);
 assert.equal(ack.checkout_created,false);
 assert.equal(ack.intake_persisted,true);
 assert.match(ack.intake_ref,/^fmp-intake-[a-f0-9]{36}$/);
 const dirname=createHash('sha256').update(request.order_key).digest('hex');
 const content=await fs.readFile(path.join(stateDir,dirname,'intake.enc'),'utf8');
 assert.doesNotMatch(content,/steering column|buyer@example.com|ABC1234/);
 assert.equal((await fs.stat(path.join(stateDir,dirname,'intake.enc'))).mode&0o777,0o600);
 assert.equal((await fs.stat(path.join(stateDir,dirname))).mode&0o777,0o700);
 const admitted=await ledger.authorizeCheckout({order_key:request.order_key,customer_email:request.customer_email,
   offer_key:request.offer_key,amount_cents:1900,currency:'usd',intake_ref:ack.intake_ref,intake_digest:ack.intake_digest});
 assert.equal(admitted.context_persisted,true);
 assert.equal(admitted.checkout_created,false);
 assert.equal(admitted.fulfillment_release,false);
 assert.equal(admitted.payment_state,'not_created');
});
test('idempotent preflight survives process restart, rejecting changed scope or customer',async(t)=>{
 const {stateDir,clock,ledger}=await setup(t);
 const req=payload();
 const first=await ledger.preflight(req);
 const afterRestart=await createFindMyPartPrivateIntakeLedger({stateDir,key,now:clock});
 assert.deepEqual(await afterRestart.preflight(req),first);
 await assert.rejects(()=>afterRestart.preflight({...req,customer_email:'other@example.com'}),/findmypart_scope_invalid_or_changed|findmypart_order_scope_conflict/);
 const changed={...req,intake:{...req.intake,part_number:'DIFFERENT'}};
 await assert.rejects(()=>afterRestart.preflight(changed),/findmypart_scope_invalid_or_changed/);
 assert.equal((await afterRestart.authorizeCheckout({order_key:req.order_key,customer_email:req.customer_email,
   offer_key:req.offer_key,amount_cents:1900,currency:'usd',intake_ref:first.intake_ref,intake_digest:first.intake_digest})).ok,true);
});
test('each tier has independent price, SKU, customer and digest binding',async(t)=>{
 const {ledger}=await setup(t);
 for(const [slug,[offer_key,amount_cents]] of Object.entries(P)){
   const req=payload(slug,'buyer-'+slug+'-unique',slug+'@example.com');
   const ack=await ledger.preflight(req);
   const authorized={order_key:req.order_key,customer_email:req.customer_email,offer_key,amount_cents,
     currency:'usd',intake_ref:ack.intake_ref,intake_digest:ack.intake_digest};
   assert.equal((await ledger.authorizeCheckout(authorized)).ok,true);
   for(const mutation of [
     {amount_cents:amount_cents+3000},{currency:'eur'},
     {customer_email:'other@example.com'},{intake_ref:'fmp-intake-wrong'},
     {intake_digest:'f'.repeat(64)},{offer_key:'some-other-offer'},
   ])await assert.rejects(()=>ledger.authorizeCheckout({...authorized,...mutation}),/findmypart_checkout_scope_mismatch/);
 }
});
test('expired intake and interrupted writes fail closed',async(t)=>{
 let time=1700000000000;
 const {stateDir,ledger}=await setup(t,()=>time);
 const req=payload('findmypart','buyer-expire-000001');
 const ack=await ledger.preflight(req);
 time+=72*3600*1000+1;
 await assert.rejects(()=>ledger.authorizeCheckout({
   order_key:req.order_key,customer_email:req.customer_email,offer_key:req.offer_key,
   amount_cents:1900,currency:'usd',intake_ref:ack.intake_ref,intake_digest:ack.intake_digest,
 }),/findmypart_intake_expired/);
 const partial=payload('findmypart','buyer-incomplete-001');
 const dir=path.join(stateDir,createHash('sha256').update(partial.order_key).digest('hex'));
 await fs.mkdir(dir);
 await fs.writeFile(path.join(dir,'intake.enc'),'garbage');
 await assert.rejects(()=>ledger.preflight(partial),/intake_not_persisted/);
});
test('unapproved offer, wrong digest and modified ciphertext never prepare checkout',async(t)=>{
 const {stateDir,ledger}=await setup(t);
 const req=payload('findmypart','buyer-tamper-00001');
 await assert.rejects(()=>ledger.preflight({...req,offer_key:'findmypart.rescue_hunt_99.v1'}),/findmypart_offer_mismatch/);
 await assert.rejects(()=>ledger.preflight({...req,intake_digest:'0'.repeat(64)}),/findmypart_scope_invalid_or_changed/);
 const ack=await ledger.preflight(req);
 const file=path.join(stateDir,createHash('sha256').update(req.order_key).digest('hex'),'intake.enc');
 const text=await fs.readFile(file,'utf8');
 const object=JSON.parse(text);object.body=randomBytes(22).toString('base64');await fs.writeFile(file,JSON.stringify(object));
 await assert.rejects(()=>ledger.authorizeCheckout({order_key:req.order_key,customer_email:req.customer_email,
   offer_key:req.offer_key,amount_cents:1900,currency:'usd',intake_ref:ack.intake_ref,intake_digest:ack.intake_digest,
 }),/intake_record_integrity_failed/);
});
test('encryption key and absolute private root are required',async()=>{
 await assert.rejects(()=>createFindMyPartPrivateIntakeLedger({stateDir:'relative',key}),/private_storage_absolute_directory_required/);
 await assert.rejects(()=>createFindMyPartPrivateIntakeLedger({stateDir:'/tmp/findmypart-unused-guard',key:Buffer.alloc(16)}),/private_storage_32_byte_encryption_key_required/);
});

test('unsafe shared storage directory is refused before any customer data write',async(t)=>{
 const stateDir=await fs.mkdtemp(path.join(os.tmpdir(),'fmp-unsafe-root-'));
 t.after(()=>fs.rm(stateDir,{recursive:true,force:true}));
 await fs.chmod(stateDir,0o755);
 await assert.rejects(()=>createFindMyPartPrivateIntakeLedger({stateDir,key}),/private_storage_directory_permissions_invalid/);
});
