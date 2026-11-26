import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash,createHmac} from 'node:crypto';
import {EvercraftPassport} from '../passport/passport.mjs';
import {EvercraftIdentity} from '../identity/identity.mjs';
import {AtlasPrivateFreightLedger,ATLAS_PRIVATE_SCHEMA} from '../atlas/private-freight-ledger.mjs';

const secret='test-only-48-byte-secret-1234567890-1234567890-ABCDE';
function session(subject,sessionId='s-001'){
 const payload={schema:'evercraft.identity.session.v1',signing_key_id:'test',
  subject_ref:subject,display_name:'Test Operator',session_id:sessionId,
  issued_at:'2026-11-24T00:00:00.000Z',expires_at:'2030-01-01T00:00:00.000Z'};
 const encoded=Buffer.from(JSON.stringify(payload)).toString('base64url');
 return encoded+'.'+createHmac('sha256',secret).update(encoded).digest('base64url');
}
function setup(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-atlas-private-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const dirs={stateDir:path.join(root,'atlas'),passportStateDir:path.join(root,'passport'),identityStateDir:path.join(root,'identity')};
 const passport=new EvercraftPassport({stateDir:dirs.passportStateDir});
 const identity=new EvercraftIdentity({stateDir:dirs.identityStateDir});
 const open=()=>new AtlasPrivateFreightLedger({...dirs,sessionKeyring:{test:secret}});
 return {root,dirs,passport,identity,open};
}
function grant(passport,{subject='user:alice',tenant='alpha',scopes=['atlas.read','atlas.write'],resources=['tenant:alpha']}={}){
 return passport.issueGrant({idempotency_key:'g:'+subject+':'+tenant+':'+scopes.join(',')+':'+resources.join(','),
  subject_ref:subject,issuer_ref:'evercraft:identity-authority',product:'systemia-atlas',
  scopes,...(resources.length?{resource_refs:resources}:{}),starts_at:'2025-01-01T00:00:00Z',ends_at:'2030-01-01T00:00:00Z',
  max_delegation_depth:0,authority_state:'verified_identity_authority',authority_receipt_ref:'test:identity:owner'});
}
const write=(ledger,sessionToken,tenant,type,payload,key,revision)=>ledger.mutate({
 sessionToken,tenant,type,payload,idempotencyKey:key,expectedRevision:revision});
const shipperInput={name:'Demo Cascade Foods',region:'Yakima, Washington'};
function ledgerFile(root,tenant='alpha'){
 const digest=createHash('sha256').update(tenant).digest('hex');
 return path.join(root,'atlas',digest.slice(0,2),digest,'events.jsonl');
}

test('requires signed current session, Passport and exact tenant resource',t=>{
 const {passport,open}=setup(t);const ledger=open();
 assert.throws(()=>ledger.read({tenant:'alpha',sessionToken:'not-a-token'}),/session_/);
 assert.throws(()=>ledger.read({tenant:'alpha',sessionToken:session('user:alice')}),/atlas_access_denied/);
 grant(passport);
 const result=ledger.read({tenant:'alpha',sessionToken:session('user:alice')});
 assert.equal(result.schema,ATLAS_PRIVATE_SCHEMA);assert.equal(result.revision,0);
 assert.equal(result.dispatch_authorized,false);
 assert.throws(()=>ledger.read({tenant:'beta',sessionToken:session('user:alice')}),/atlas_access_denied/);
 assert.throws(()=>ledger.read({tenant:'../alpha',sessionToken:session('user:alice')}),/tenant_id_invalid/);
});
test('unscoped Passport grants are not Atlas tenant membership',t=>{
 const {passport,open}=setup(t);grant(passport,{resources:[]});
 assert.throws(()=>open().read({tenant:'alpha',sessionToken:session('user:alice')}),/atlas_explicit_tenant_grant_required/);
});
test('tenant event chain survives restart, and state stays isolated',t=>{
 const {root,passport,open}=setup(t);grant(passport);
 grant(passport,{tenant:'beta',resources:['tenant:beta']});
 const ledger=open(),token=session('user:alice');
 const a=write(ledger,token,'alpha','shipper.created',shipperInput,'shp-001',0);
 assert.equal(a.state,'recorded');assert.equal(a.revision,1);assert.equal(a.dispatch_allowed,false);
 const b=write(ledger,token,'beta','shipper.created',{name:'Demo Inland Foods'},'shp-001',0);
 assert.equal(b.revision,1);assert.notEqual(a.event_hash,b.event_hash);
 const restarted=open();
 const alpha=restarted.read({tenant:'alpha',sessionToken:token});
 const beta=restarted.read({tenant:'beta',sessionToken:token});
 assert.equal(alpha.shippers.length,1);assert.equal(beta.shippers.length,1);
 assert.equal(alpha.shippers[0].name,'Demo Cascade Foods');
 assert.equal(beta.shippers[0].name,'Demo Inland Foods');
 assert.equal(alpha.events[0].previous_hash,'sha256:'+'0'.repeat(64));
 assert.equal(fs.statSync(ledgerFile(root,'alpha')).mode&0o077,0);
});
test('idempotent retries survive restart; changed payload or stale revision fail closed',t=>{
 const {passport,open}=setup(t);grant(passport);const token=session('user:alice');
 const first=write(open(),token,'alpha','shipper.created',shipperInput,'shp-1',0);
 const dupe=write(open(),token,'alpha','shipper.created',shipperInput,'shp-1',0);
 assert.equal(dupe.state,'duplicate');assert.equal(dupe.event_hash,first.event_hash);
 assert.throws(()=>write(open(),token,'alpha','shipper.created',{name:'Different'},'shp-1',1),/atlas_idempotency_conflict/);
 assert.throws(()=>write(open(),token,'alpha','carrier.registered',{name:'Demo Carrier'},'carrier-1',0),/atlas_revision_conflict/);
 assert.equal(open().read({tenant:'alpha',sessionToken:token}).revision,1);
});
test('read-only grant cannot mutate; write-only grant cannot read',t=>{
 const {passport,open}=setup(t);
 grant(passport,{subject:'user:reader',scopes:['atlas.read']});
 grant(passport,{subject:'user:writer',scopes:['atlas.write']});
 const ledger=open();
 assert.throws(()=>write(ledger,session('user:reader'),'alpha','shipper.created',shipperInput,'reader-writes',0),/atlas_access_denied/);
 assert.throws(()=>ledger.read({sessionToken:session('user:writer'),tenant:'alpha'}),/atlas_access_denied/);
 const w=write(ledger,session('user:writer'),'alpha','shipper.created',shipperInput,'writer-1',0);
 assert.equal(w.revision,1);
 const r=ledger.read({sessionToken:session('user:reader'),tenant:'alpha'});
 assert.equal(r.shippers.length,1);
});
test('revoked sessions fail closed before reading or mutating',t=>{
 const {passport,identity,open}=setup(t);grant(passport);
 const token=session('user:alice','session-to-revoke');
 const ledger=open();
 assert.equal(ledger.read({sessionToken:token,tenant:'alpha'}).revision,0);
 identity.revokeSession({sessionId:'session-to-revoke',subjectRef:'user:alice',reason:'explicit_logout'});
 assert.throws(()=>ledger.read({sessionToken:token,tenant:'alpha'}),/session_revoked/);
 assert.throws(()=>write(ledger,token,'alpha','shipper.created',shipperInput,'blocked',0),/session_revoked/);
});
test('only draft quote and evidence actions work; real dispatch is unreachable',t=>{
 const {passport,open}=setup(t);grant(passport);
 const ledger=open(),token=session('user:alice');
 const shipper=write(ledger,token,'alpha','shipper.created',shipperInput,'shipper',0);
 const carrier=write(ledger,token,'alpha','carrier.registered',{name:'Demo Haulage'},'carrier',1);
 assert.equal(carrier.record.authority_state,'not_checked');
 const load=write(ledger,token,'alpha','load.opened',{
  shipper_id:shipper.record.id,carrier_id:carrier.record.id,
  origin:'Yakima, WA',destination:'Seattle, WA',equipment:'Dry van'
 },'load',2);
 assert.equal(load.record.dispatch_authorized,false);
 assert.throws(()=>write(ledger,token,'alpha','load.dispatched',{load_id:load.record.id},'dispatch',3),/atlas_event_type_denied/);
 const quote=write(ledger,token,'alpha','load.quoted',{
  load_id:load.record.id,customer_rate_cents:185000,carrier_cost_cents:150000
 },'quote',3);
 assert.equal(quote.record.status,'draft_not_sent');
 assert.throws(()=>write(ledger,token,'alpha','load.quoted',{
  load_id:load.record.id,customer_rate_cents:10000,carrier_cost_cents:9000},'quote2',4),/atlas_load_not_quotable/);
 const ex=write(ledger,token,'alpha','exception.opened',{load_id:load.record.id,reason:'Example schedule mismatch'},'issue',4);
 write(ledger,token,'alpha','exception.resolved',{exception_id:ex.record.id,resolution:'Sample corrected'},'resolved',5);
 const after=ledger.read({tenant:'alpha',sessionToken:token});
 assert.equal(after.revision,6);assert.equal(after.loads[0].state,'quoted_proposal');
 assert.equal(after.exceptions[0].open,false);
 assert.equal(after.customer_service_enabled,false);
});
test('tampered audit line prevents all reads and writes; cannot auto-heal',t=>{
 const {root,passport,open}=setup(t);grant(passport);
 const ledger=open(),token=session('user:alice');
 write(ledger,token,'alpha','shipper.created',shipperInput,'s1',0);
 const f=ledgerFile(root);
 const before=fs.readFileSync(f,'utf8');
 fs.writeFileSync(f,before.replace('Demo Cascade Foods','Demo Cascade Foodx'),{mode:0o600});
 assert.throws(()=>open().read({tenant:'alpha',sessionToken:token}),/atlas_hash_mismatch/);
 assert.throws(()=>write(open(),token,'alpha','shipper.created',{name:'Other'},'s2',1),/atlas_hash_mismatch/);
});
test('truncated, overexposed and conflicting logs cannot be accepted',t=>{
 const {root,passport,open}=setup(t);grant(passport);
 const ledger=open(),token=session('user:alice');
 write(ledger,token,'alpha','shipper.created',shipperInput,'shp-3',0);
 const file=ledgerFile(root),original=fs.readFileSync(file,'utf8');
 fs.writeFileSync(file,original.trimEnd(),{mode:0o600});
 assert.throws(()=>ledger.read({tenant:'alpha',sessionToken:token}),/atlas_truncated_event_log/);
 fs.writeFileSync(file,original,{mode:0o600});
 fs.chmodSync(file,0o644);
 assert.throws(()=>ledger.read({tenant:'alpha',sessionToken:token}),/atlas_private_file_required/);
});
