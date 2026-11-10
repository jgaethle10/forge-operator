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
