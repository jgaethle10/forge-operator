import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {generatePqSigner} from '../systemia/crypto/pq-signed-envelope.mjs';
import {pqRuntime} from '../systemia/crypto/pq-envelope.mjs';
import {signPqTrustSnapshot,importSignedPqTrustSnapshot} from '../systemia/crypto/pq-trust-snapshot.mjs';
import {createSharedPostgresTrustRevisionGuard} from '../systemia/crypto/pq-trust-revision-postgres.mjs';

const activeEntry=(signer,now,status='active')=>({
  sender:'node001',keyId:signer.senderKeyId,
  publicKeyPem:signer.publicKey.export({type:'spki',format:'pem'}),
  status,notBeforeMs:now-20000,notAfterMs:now+600000
});
function memoryHighWater(){
  const seen=new Map();
  return {async admit({authority,revision,digest}){
    const old=seen.get(authority);
    if(old && (revision<old.revision || (revision===old.revision && digest!==old.digest))) return false;
    seen.set(authority,{revision,digest});return true;
  }};
}

test('shared revision guard rejects unavailable or uncertain PostgreSQL admissions',async()=>{
  assert.throws(()=>createSharedPostgresTrustRevisionGuard(),/PostgreSQL/);
  const no=createSharedPostgresTrustRevisionGuard({client:{query:async()=>{throw Error('offline');}}});
  assert.equal(await no.admit({authority:'systemia',revision:1,digest:'f'.repeat(64)}),false);
  assert.equal(await no.admit({authority:'',revision:1,digest:'f'.repeat(64)}),false);
  const yes=createSharedPostgresTrustRevisionGuard({client:{query:async(sql,args)=>{
    assert.match(sql,/ON CONFLICT \(authority\) DO UPDATE/);
    assert.match(sql,/revision = EXCLUDED.revision/);
    return {rowCount:1,rows:[{authority:args[0],revision:args[1],digest:args[2]}]};
  }}});
  assert.equal(await yes.admit({authority:'systemia',revision:9,digest:'a'.repeat(64)}),true);
  const uncertain=createSharedPostgresTrustRevisionGuard({client:{query:async()=>({rowCount:1,rows:[{authority:'other'}]})}});
  assert.equal(await uncertain.admit({authority:'systemia',revision:9,digest:'a'.repeat(64)}),false);
});

test('root-signed trust snapshots reject tampering and rollback after rotation',{skip:!pqRuntime().available},async()=>{
  const now=Date.now();
  const root=generateKeyPairSync('ml-dsa-65');
  const unauthorizedRoot=generateKeyPairSync('ml-dsa-65');
  const oldSigner=generatePqSigner(),newSigner=generatePqSigner();
  const guard=memoryHighWater();
  const create=(revision,entries)=>signPqTrustSnapshot({
    rootPrivateKey:root.privateKey,authority:'systemia.trust.lab',revision,
    validFromMs:now-1000,validUntilMs:now+120000,entries
  });
  const old=create(1,[activeEntry(oldSigner,now)]);
  const load=(signedSnapshot=old,overrides={})=>importSignedPqTrustSnapshot({
    signedSnapshot,trustedRootPublicKey:root.publicKey,
    expectedAuthority:'systemia.trust.lab',revisionGuard:guard,nowMs:now,...overrides
  });
  const first=await load();
  assert.equal(first.revision,1);
  assert.ok(first.registry.resolve({sender:'node001',keyId:oldSigner.senderKeyId,nowMs:now}));

  const tampered=structuredClone(old);
  tampered.payload.entries[0].status='revoked';
  await assert.rejects(load(tampered),/rejected/);
  await assert.rejects(load(old,{trustedRootPublicKey:unauthorizedRoot.publicKey}),/rejected/);
  await assert.rejects(load(old,{expectedAuthority:'systemia.another'}),/rejected/);
  await assert.rejects(load(old,{nowMs:now+120001}),/rejected/);
  await assert.rejects(load({...old,extra:'untrusted'}),/rejected/);
  await assert.rejects(load(old,{revisionGuard:{admit:async()=>false}}),/rejected/);

  const rotated=create(2,[activeEntry(oldSigner,now,'revoked'),activeEntry(newSigner,now)]);
  const second=await load(rotated);
  assert.equal(second.revision,2);
  assert.equal(second.registry.resolve({sender:'node001',keyId:oldSigner.senderKeyId,nowMs:now}),null);
  assert.ok(second.registry.resolve({sender:'node001',keyId:newSigner.senderKeyId,nowMs:now}));

  // Same revision and digest is safe to re-import; old revision is not.
  assert.equal((await load(rotated)).revision,2);
  await assert.rejects(load(old),/rejected/);
  const equivocation=create(2,[activeEntry(oldSigner,now)]);
  await assert.rejects(load(equivocation),/rejected/);
  const forged=create(3,[activeEntry(newSigner,now)]);
  forged.payload.entries[0].sender='mallory';
  await assert.rejects(load(forged),/rejected/);
});

test('trust snapshots reject invalid expiry windows and unapproved signing types',{skip:!pqRuntime().available},()=>{
  const now=Date.now();
  const root=generateKeyPairSync('ml-dsa-65');
  const signer=generatePqSigner();
  assert.throws(()=>signPqTrustSnapshot({
    rootPrivateKey:root.privateKey,authority:'systemia.trust.lab',revision:1,
    validFromMs:now,validUntilMs:now+16*60_000,entries:[activeEntry(signer,now)]
  }),/15 minutes/);
  assert.throws(()=>signPqTrustSnapshot({
    rootPrivateKey:root.privateKey,authority:'systemia.trust.lab',revision:1,
    validFromMs:now,validUntilMs:now+60_000,entries:[{...activeEntry(signer,now),keyId:'a'.repeat(64)}]
  }),/fingerprint/);
});
