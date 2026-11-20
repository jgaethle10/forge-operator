import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {EvercraftPassport} from '../passport/passport.mjs';
import {generateWingKeys,openWingBundle} from './envelope.mjs';
import {draftPrivateAssetDemand,stagePrivateAssetDemand} from './private-asset-demand.mjs';
import {fingerprintPrivateAssetDemand,prepareAuthorizedHarborPickup,
 ASSET_PICKUP_SCHEMA,ASSET_PICKUP_PRODUCT,ASSET_PICKUP_SCOPE}
 from './authorized-asset-demand-dispatch.mjs';
const now=()=>new Date('2026-11-20T08:00:00.000Z');
const fprint=key=>crypto.createHash('sha256').update(crypto.createPublicKey(
 fs.readFileSync(key)).export({type:'spki',format:'der'})).digest('hex');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'wing-demand-dispatch-'));
 fs.chmodSync(root,0o700);
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const mkdir=n=>{const p=path.join(root,n);fs.mkdirSync(p,{mode:0o700});return p};
 const queue=mkdir('queue'),outbox=mkdir('outbox'),received=mkdir('received'),passport=mkdir('passport');
 const fallen=path.join(root,'fallen'),harbor=path.join(root,'harbor');
 generateWingKeys({dir:fallen,wing:'fallen'});
 generateWingKeys({dir:harbor,wing:'harbor'});
 const request=draftPrivateAssetDemand({
  caseRef:'commercial-recovery-pilot',expectedAssetCount:12,now,
  randomBytes:()=>Buffer.from('00112233445566778899aabbccddeeff','hex')
 });
 stagePrivateAssetDemand({request,privateQueueDir:queue});
 const db=new EvercraftPassport({stateDir:passport});
 const actor='agent:systemia:intake';
 const grant=db.issueGrant({
  idempotency_key:'asset:grant',subject_ref:actor,issuer_ref:'test:trusted-identity',
  product:ASSET_PICKUP_PRODUCT,scopes:[ASSET_PICKUP_SCOPE],
  resource_refs:['asset-demand:'+request.caseRef],
  starts_at:'2026-11-20T07:00:00.000Z',ends_at:'2026-11-21T07:00:00.000Z',
  authority_state:'manual_authorized',authority_receipt_ref:'test:operator-reviewed',
 });
 const mint=overrides=>db.mintActionPermit({
  idempotency_key:'asset:permit:'+crypto.randomUUID(),grant_id:grant.grant.grant_id,
  actor_ref:actor,scope:ASSET_PICKUP_SCOPE,
  resource_ref:'asset-demand:'+request.caseRef,
  request_fingerprint:fingerprintPrivateAssetDemand(request),
  minted_at:'2026-11-20T07:59:00.000Z',ttl_seconds:600,...overrides,
 });
 const run=(permitId,more={})=>prepareAuthorizedHarborPickup({
  requestId:request.requestId,privateQueueDir:queue,passportStateDir:passport,
  permitId,actorRef:actor,outboxDir:outbox,
  recipientPublicKeyFile:path.join(harbor,'decrypt.pub'),
  recipientPublicKeyFingerprint:fprint(path.join(harbor,'decrypt.pub')),
  senderSigningKeyFile:path.join(fallen,'sign.key'),
  senderSigningKeyFingerprint:fprint(path.join(fallen,'sign.pub')),
  now,...more
 });
 return {root,queue,outbox,received,passport,request,fallen,harbor,actor,db,mint,run};
}
test('real synthetic encrypted reverse wing request needs one-use Passport and decrypts for Harbor only',t=>{
 const fx=fixture(t);
 const permit=fx.mint();
 const result=fx.run(permit.permit.permit_id);
 assert.equal(result.schema,ASSET_PICKUP_SCHEMA);
 assert.equal(result.state,'ENCRYPTED_HARBOR_PICKUP_REQUEST_PREPARED');
 assert.equal(result.requestExpectedOriginals,12);
 assert.equal(result.brokerUploadPerformed,false);
 assert.equal(result.harborReceived,false);
 assert.equal(result.productionAuthorized,false);
 assert.equal(result.passportPermitConsumed,true);
 const out=path.join(fx.outbox,fx.request.requestId+'.wing');
 const meta=JSON.parse(fs.readFileSync(out+'.json','utf8'));
 assert.equal(meta.kind,undefined);
 assert.equal(meta.fromWing,'fallen');assert.equal(meta.toWing,'harbor');
 assert.equal(fs.statSync(out).mode&0o077,0);
 const received=openWingBundle({
  encryptedFile:out,destinationDir:fx.received,
  receiverPrivateKeyFile:path.join(fx.harbor,'decrypt.key'),
  trustedSenderPublicKeyFile:path.join(fx.fallen,'sign.pub'),
  expectedFromWing:'fallen',expectedToWing:'harbor'
 });
 assert.equal(received.receipt.kind,'work_packet');
 assert.equal(received.receipt.assets.length,1);
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(received.directory,
  fx.request.requestId+'.json'),'utf8')),fx.request);
 assert.equal(fx.db.getActionPermitState(permit.permit.permit_id,{at:now().toISOString()}).active,false);
 assert.throws(()=>fx.run(permit.permit.permit_id),/passport_permit_denied/);
});
test('no real grant or permit denies and creates no outbox',t=>{
 const fx=fixture(t);
 assert.throws(()=>fx.run('permit_nonexistent'),/permit_not_found/);
 assert.deepEqual(fs.readdirSync(fx.outbox),[]);
});
test('wrong resource and wrong request fingerprint fail closed',t=>{
 const fx=fixture(t);
 const wrongRequest=fx.mint({request_fingerprint:'sha256:'+'1'.repeat(64)});
 assert.throws(()=>fx.run(wrongRequest.permit.permit_id),/passport_permit_denied/);
 assert.equal(fx.db.getActionPermitState(wrongRequest.permit.permit_id,{at:now().toISOString()}).active,true);
 assert.equal(fs.readdirSync(fx.outbox).length,0);
});
test('recipient public key fingerprint mismatch holds without consuming permit',t=>{
 const fx=fixture(t),permit=fx.mint();
 assert.throws(()=>fx.run(permit.permit.permit_id,{
  recipientPublicKeyFingerprint:'f'.repeat(64)}),/key_fingerprint_mismatch/);
 assert.equal(fx.db.getActionPermitState(permit.permit.permit_id,{at:now().toISOString()}).active,true);
 assert.deepEqual(fs.readdirSync(fx.outbox),[]);
});
test('sender signer and private outbox cannot be replaced or bypassed',t=>{
 const fx=fixture(t),permit=fx.mint();
 const output=path.join(fx.outbox,fx.request.requestId+'.wing');
 fs.symlinkSync(path.join(fx.root,'missing.wing'),output);
 assert.throws(()=>fx.run(permit.permit.permit_id),/outbox_already_exists/);
 fs.rmSync(output);
 fs.chmodSync(fx.outbox,0o755);
 assert.throws(()=>fx.run(permit.permit.permit_id),/private_outbox_invalid/);
 fs.chmodSync(fx.outbox,0o700);
 assert.throws(()=>fx.run(permit.permit.permit_id,{
  senderSigningKeyFingerprint:'0'.repeat(64)}),/key_fingerprint_mismatch/);
 assert.equal(fx.db.getActionPermitState(permit.permit.permit_id,{at:now().toISOString()}).active,true);
});
test('expired or cross-actor permit cannot authorize encrypted request',t=>{
 const fx=fixture(t),permit=fx.mint();
 assert.throws(()=>fx.run(permit.permit.permit_id,{actorRef:'agent:systemia:other'}),
  /passport_permit_denied/);
 assert.throws(()=>fx.run(permit.permit.permit_id,{now:()=>new Date('2026-11-21T09:00:00Z')}),
  /passport_permit_denied/);
 assert.deepEqual(fs.readdirSync(fx.outbox),[]);
});
