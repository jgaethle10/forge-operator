import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {generateWingKeys,createWingBundle} from './envelope.mjs';
import {startWingCourierBroker} from './broker.mjs';
import {pushEncryptedWingBundle} from './client.mjs';
import {cycle} from './resident.mjs';
import {EvercraftPassport} from '../passport/passport.mjs';

test('receiver custody survives absent Passport and is offered to Systemia when authorized',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'wing-resident-'));fs.chmodSync(root,0o700);
 const dir=n=>{let p=path.join(root,n);fs.mkdirSync(p,{mode:0o700});return p};
 const harbor=dir('harbor'),fallen=dir('fallen'),sources=dir('sources'),out=dir('out'),inbox=dir('inbox'),serverState=dir('server');
 generateWingKeys({dir:harbor,wing:'harbor'});generateWingKeys({dir:fallen,wing:'fallen'});
 fs.writeFileSync(path.join(sources,'photo.jpg'),Buffer.from('synthetic test only'),{mode:0o600});
 const bundle=path.join(out,'inbound.wing');
 const meta=createWingBundle({sourceDir:sources,output:bundle,recipientPublicKeyFile:path.join(fallen,'decrypt.pub'),
  senderSigningKeyFile:path.join(harbor,'sign.key'),fromWing:'harbor',toWing:'fallen',filenames:['photo.jpg']});
 fs.writeFileSync(bundle+'.json',JSON.stringify(meta),{mode:0o600});
 const hs=crypto.randomBytes(32).toString('hex'),hr=crypto.randomBytes(32).toString('hex'),
  fsToken=crypto.randomBytes(32).toString('hex'),fr=crypto.randomBytes(32).toString('hex');
 const senderToken=path.join(harbor,'send.token'),receiverToken=path.join(fallen,'receive.token');
 fs.writeFileSync(senderToken,hs,{mode:0o600});fs.writeFileSync(receiverToken,fr,{mode:0o600});
 const broker=await startWingCourierBroker({stateDir:serverState,wingCredentials:[
  {wing:'harbor',sendToken:hs,receiveToken:hr,allowedDestinations:['fallen'],ackVerifyPublicKeyFile:path.join(harbor,'sign.pub')},
  {wing:'fallen',sendToken:fsToken,receiveToken:fr,allowedDestinations:['harbor'],ackVerifyPublicKeyFile:path.join(fallen,'sign.pub')}
 ]});
 try{
  const send=await pushEncryptedWingBundle({baseUrl:broker.url,tokenFile:senderToken,bundleFile:bundle,metaFile:bundle+'.json'});
  assert.equal(send.state,'BROKER_CIPHERTEXT_STORED');
  const passportStateDir=path.join(root,'passport'),intakeStateDir=path.join(root,'intake');
  const cfg={baseUrl:broker.url,receiveTokenFile:receiverToken,wing:'fallen',destinationDir:inbox,
   receiverPrivateKeyFile:path.join(fallen,'decrypt.key'),receiverSigningKeyFile:path.join(fallen,'sign.key'),senderVerifyPublicKeys:{harbor:path.join(harbor,'sign.pub')},
   passportStateDir,intakeStateDir,adapterActorRef:'adapter:wing-courier'};
  const first=await cycle({config:cfg});
  assert.equal(first.received,1,JSON.stringify(first));
  assert.equal(first.intake.pending,1,'without a Passport grant, custody exists but Systemia admission fails closed');
  assert.equal(fs.existsSync(path.join(inbox,meta.id,'intake-offer.json')),false);
  const passport=new EvercraftPassport({stateDir:passportStateDir});
  passport.issueGrant({grant_id:'grant_wing_agent_recovery',idempotency_key:'wing:grant:agent',
   subject_ref:'adapter:wing-courier',issuer_ref:'evercraft:identity-authority',product:'evercraft-intake',
   scopes:['intake.write.agent'],starts_at:'2026-01-01T00:00:00Z',ends_at:'2027-12-31T00:00:00Z',
   authority_state:'verified_identity_authority',authority_receipt_ref:'identity:adapter:wing-courier'});
  const second=await cycle({config:cfg});
  assert.equal(second.received,0,'broker must not redeliver acked package');
  assert.equal(second.intake.offered,1,'existing verified private local custody is re-offered after grant');
  const admission=JSON.parse(fs.readFileSync(path.join(inbox,meta.id,'intake-offer.json'),'utf8'));
  assert.equal(admission.executionGranted,false);
  assert.equal(admission.admissionGranted,false);
  assert.equal(admission.intakeState,'candidate_only');
  const third=await cycle({config:cfg});
  assert.equal(third.intake.attempted,0,'admission must be durable and idempotent');
 }finally{await broker.close();fs.rmSync(root,{recursive:true,force:true})}
});
