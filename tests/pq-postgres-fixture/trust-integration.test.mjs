import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {generateKeyPairSync} from 'node:crypto';
import pg from 'pg';
import {createSharedPostgresTrustRevisionGuard} from '../../systemia/crypto/pq-trust-revision-postgres.mjs';
import {signPqTrustSnapshot,importSignedPqTrustSnapshot} from '../../systemia/crypto/pq-trust-snapshot.mjs';
import {generatePqSigner} from '../../systemia/crypto/pq-signed-envelope.mjs';

const {Pool}=pg;
const connectionString=process.env.PQ_REPLAY_TEST_DATABASE_URL;
const migration=fileURLToPath(new URL('../../systemia/crypto/sql/postgres-trust-highwater-v1.sql',import.meta.url));

test('one PostgreSQL writer arbitrates concurrent trust revisions and rejects rollback',
  {skip:!connectionString},async()=>{
  const a=new Pool({connectionString,max:5,connectionTimeoutMillis:3000});
  const b=new Pool({connectionString,max:5,connectionTimeoutMillis:3000});
  try {
    await a.query(readFileSync(migration,'utf8'));
    await a.query('TRUNCATE TABLE public.pq_trust_highwater_v1');
    const guardA=createSharedPostgresTrustRevisionGuard({client:a});
    const guardB=createSharedPostgresTrustRevisionGuard({client:b});
    const authority='systemia.trust.ci';
    const data={authority,revision:1,digest:'a'.repeat(64)};
    const contenders=await Promise.all(Array.from({length:16},(_,i)=>
      (i%2?guardA:guardB).admit(data)));
    assert.equal(contenders.filter(Boolean).length,16);
    assert.equal(await guardB.admit({...data,digest:'b'.repeat(64)}),false);
    // Conflicting same-revision trust snapshots cannot both become canonical.
    const contested=authority+'.contested';
    const disputes=await Promise.all([
      guardA.admit({authority:contested,revision:1,digest:'a'.repeat(64)}),
      guardB.admit({authority:contested,revision:1,digest:'b'.repeat(64)})
    ]);
    assert.equal(disputes.filter(Boolean).length,1);

    const root=generateKeyPairSync('ml-dsa-65');
    const signer=generatePqSigner();
    const now=Date.now();
    const e=(status='active')=>({
      sender:'node001',keyId:signer.senderKeyId,
      publicKeyPem:signer.publicKey.export({type:'spki',format:'pem'}),
      status,notBeforeMs:now-1000,notAfterMs:now+60000
    });
    const sign=(revision,status)=>signPqTrustSnapshot({
      rootPrivateKey:root.privateKey,authority,revision,
      validFromMs:now-1000,validUntilMs:now+120000,entries:[e(status)]
    });
    const old=sign(2,'active'),revoked=sign(3,'revoked');
    const load=(signedSnapshot,guard)=>importSignedPqTrustSnapshot({
      signedSnapshot,trustedRootPublicKey:root.publicKey,
      expectedAuthority:authority,revisionGuard:guard,nowMs:now
    });
    const approved=await load(old,guardA);
    assert.equal(approved.revision,2);
    const revokedEntry=await load(revoked,guardB);
    assert.equal(revokedEntry.registry.resolve({
      sender:'node001',keyId:signer.senderKeyId,nowMs:now
    }),null);
    await assert.rejects(load(old,guardA),/rejected/);
    assert.equal(await guardA.admit({authority,revision:2,digest:approved.digest}),false);
    assert.equal(await guardB.admit({authority,revision:3,digest:revokedEntry.digest}),true);
    assert.equal(await guardB.admit({authority,revision:3,digest:'c'.repeat(64)}),false);
    const failed=createSharedPostgresTrustRevisionGuard({
      client:{query:async()=>{throw new Error('authority offline')}}
    });
    await assert.rejects(load(revoked,failed),/rejected/);
  } finally {
    await Promise.allSettled([a.end(),b.end()]);
  }
});


test('atomic current-trust gate blocks stale signers before nonce admission',
  {skip:!connectionString},async()=>{
  const {randomBytes}=await import('node:crypto');
  const {readFileSync}=await import('node:fs');
  const {fileURLToPath}=await import('node:url');
  const {generatePqRecipient}=await import('../../systemia/crypto/pq-envelope.mjs');
  const {signAndEncryptPqMessage}=await import('../../systemia/crypto/pq-signed-envelope.mjs');
  const {openCurrentTrustPqMessageAsync,createCurrentTrustReplayGuard}=
    await import('../../systemia/crypto/pq-current-trust-replay.mjs');

  const poolA=new Pool({connectionString,max:4,connectionTimeoutMillis:3000});
  const poolB=new Pool({connectionString,max:4,connectionTimeoutMillis:3000});
  try {
    const replayMigration=fileURLToPath(new URL('../../systemia/crypto/sql/postgres-replay-v1.sql',import.meta.url));
    await poolA.query(readFileSync(migration,'utf8'));
    await poolA.query(readFileSync(replayMigration,'utf8'));
    const root=generateKeyPairSync('ml-dsa-65');
    const oldSigner=generatePqSigner();
    const newSigner=generatePqSigner();
    const recipient=generatePqRecipient();
    const now=Date.now();
    const authority='systemia.trust.current.'+randomBytes(6).toString('hex');
    const entry=(signer,status)=>({
      sender:'node001',keyId:signer.senderKeyId,
      publicKeyPem:signer.publicKey.export({type:'spki',format:'pem'}),
      status,notBeforeMs:now-30000,notAfterMs:now+120000
    });
    const sign=(revision,entries)=>signPqTrustSnapshot({
      rootPrivateKey:root.privateKey,authority,revision,
      validFromMs:now-10000,validUntilMs:now+120000,entries
    });
    const trustA=createSharedPostgresTrustRevisionGuard({client:poolA});
    const trustB=createSharedPostgresTrustRevisionGuard({client:poolB});
    const load=(snapshot,guard)=>importSignedPqTrustSnapshot({
      signedSnapshot:snapshot,trustedRootPublicKey:root.publicKey,
      expectedAuthority:authority,revisionGuard:guard,nowMs:now
    });
    const oldImported=await load(sign(1,[entry(oldSigner,'active')]),trustA);
    const send=(signer,text)=>signAndEncryptPqMessage({
      senderPrivateKey:signer.privateKey,sender:'node001',
      recipientPublicKey:recipient.publicKey,plaintext:text,
      context:'systemia.lab.current-trust',nowMs:now,ttlSeconds:90
    });
    const open=(client,importedSnapshot,signedMessage)=>openCurrentTrustPqMessageAsync({
      client,importedSnapshot,signedMessage,expectedSender:'node001',
      recipientPrivateKey:recipient.privateKey,expectedContext:'systemia.lab.current-trust',nowMs:now
    });
    const first=send(oldSigner,'before revocation');
    assert.equal((await open(poolA,oldImported,first)).plaintext.toString(),'before revocation');
    await assert.rejects(open(poolB,oldImported,first),/rejected|denied/);

    const revoked=await load(sign(2,[
      entry(oldSigner,'revoked'),entry(newSigner,'active')
    ]),trustB);
    assert.equal(revoked.revision,2);

    // Previously imported and still unexpired old registry is NOT current.
    const afterRevoke=send(oldSigner,'must be denied');
    await assert.rejects(open(poolA,oldImported,afterRevoke),/rejected|denied/);
    assert.equal(revoked.registry.resolve({sender:'node001',keyId:oldSigner.senderKeyId,nowMs:now}),null);

    const fresh=send(newSigner,'now trusted');
    assert.equal((await open(poolB,revoked,fresh)).plaintext.toString(),'now trusted');
    await assert.rejects(open(poolA,revoked,fresh),/rejected|denied/);

    // Forged metadata is not a valid signature-verified import.
    assert.throws(()=>createCurrentTrustReplayGuard({
      client:poolA,importedSnapshot:{...revoked}
    }),/verified/);

    // DB outage and dubious confirmation both fail closed.
    const outage={query:async()=>{throw new Error('network partition');}};
    await assert.rejects(open(outage,revoked,send(newSigner,'outage')),/rejected|denied/);
    const uncertain={query:async()=>({rowCount:1,rows:[{token_digest:'wrong'}]})};
    await assert.rejects(open(uncertain,revoked,send(newSigner,'uncertain')),/rejected|denied/);

    // Authority's database clock, not caller-supplied timestamp, gates expiration.
    const expired=signPqTrustSnapshot({
      rootPrivateKey:root.privateKey,authority,revision:3,
      validFromMs:now-120000,validUntilMs:now-60000,
      entries:[entry(newSigner,'active')]
    });
    await assert.rejects(load(expired,trustA),/rejected/);
  } finally {
    await Promise.allSettled([poolA.end(),poolB.end()]);
  }
});
