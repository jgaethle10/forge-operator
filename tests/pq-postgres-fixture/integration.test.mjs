import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import pg from 'pg';
import {createSharedPostgresReplayGuard} from '../../systemia/crypto/pq-replay-postgres.mjs';
import {generatePqRecipient} from '../../systemia/crypto/pq-envelope.mjs';
import {
  generatePqSigner,signAndEncryptPqMessage,openSignedPqMessageAsync
} from '../../systemia/crypto/pq-signed-envelope.mjs';

const {Pool}=pg;
const databaseUrl=process.env.PQ_REPLAY_TEST_DATABASE_URL;
const migration=fileURLToPath(new URL('../../systemia/crypto/sql/postgres-replay-v1.sql',import.meta.url));
const worker=fileURLToPath(new URL('./worker.mjs',import.meta.url));

function workerRun(nonce) {
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[worker,nonce],{
      env:{...process.env,PQ_REPLAY_TEST_DATABASE_URL:databaseUrl},
      stdio:['ignore','pipe','pipe']
    });
    let stdout='',stderr='';
    child.stdout.on('data',v=>{stdout+=v;});
    child.stderr.on('data',v=>{stderr+=v;});
    child.on('error',reject);
    child.on('close',code=>{
      if (code!==0) reject(new Error('PG replay worker failed: '+stderr.slice(-1200)));
      else resolve(stdout.trim());
    });
  });
}

test('shared PostgreSQL primary rejects parallel workers and persists ML-DSA replay',{skip:!databaseUrl},async()=>{
  const poolA=new Pool({connectionString:databaseUrl,max:5,connectionTimeoutMillis:2500});
  const poolB=new Pool({connectionString:databaseUrl,max:5,connectionTimeoutMillis:2500});
  try {
    await poolA.query(readFileSync(migration,'utf8'));
    await poolA.query('TRUNCATE TABLE public.pq_replay_nonces_v1');

    // Different connection pools model two independent Systemia nodes sharing
    // one authoritative writer, not a real cross-host field deployment.
    const sharedNonce=randomBytes(24).toString('base64url');
    const now=Date.now();
    const replay={
      senderId:'node001',senderKeyId:'c'.repeat(64),
      context:'systemia.lab.shared',nonce:sharedNonce,
      nowMs:now,expiresAtMs:now+60_000
    };
    const guardA=createSharedPostgresReplayGuard({client:poolA});
    const guardB=createSharedPostgresReplayGuard({client:poolB});
    const responses=await Promise.all(Array.from({length:12},(_,i)=>
      (i%2===0?guardA:guardB).consume(replay)));
    assert.equal(responses.filter(Boolean).length,1);
    assert.equal(responses.filter(v=>v===false).length,11);
    assert.equal(await guardB.consume(replay),false);

    const processNonce=randomBytes(24).toString('base64url');
    const workers=await Promise.all(Array.from({length:8},()=>workerRun(processNonce)));
    assert.equal(workers.filter(v=>v==='ACCEPT').length,1);
    assert.equal(workers.filter(v=>v==='REJECT').length,7);

    // DB time is authoritative, not the caller's supplied clock.
    assert.equal(await guardA.consume({
      ...replay,nonce:randomBytes(24).toString('base64url'),
      nowMs:0,expiresAtMs:60_000
    }),false);

    const sender=generatePqSigner();
    const recipient=generatePqRecipient();
    const signed=signAndEncryptPqMessage({
      senderPrivateKey:sender.privateKey,sender:'node001',
      recipientPublicKey:recipient.publicKey,
      plaintext:'Systemia shared authority proof',context:'systemia.lab.shared',
      nowMs:now,ttlSeconds:90
    });
    const open=guard=>openSignedPqMessageAsync({
      signedMessage:signed, senderPublicKey:sender.publicKey,
      expectedSender:'node001',recipientPrivateKey:recipient.privateKey,
      expectedContext:'systemia.lab.shared',replayGuard:guard,nowMs:now
    });
    assert.equal((await open(guardA)).plaintext.toString(),'Systemia shared authority proof');
    assert.rejects(open(guardB),/rejected/);

    const denied=createSharedPostgresReplayGuard({client:{query:async()=>{throw new Error('unreachable');}}});
    const newSigned=signAndEncryptPqMessage({
      senderPrivateKey:sender.privateKey,sender:'node001',
      recipientPublicKey:recipient.publicKey,
      plaintext:'must not release',context:'systemia.lab.shared',
      nowMs:now,ttlSeconds:90
    });
    await assert.rejects(openSignedPqMessageAsync({
      signedMessage:newSigned,senderPublicKey:sender.publicKey,expectedSender:'node001',
      recipientPrivateKey:recipient.privateKey,expectedContext:'systemia.lab.shared',
      replayGuard:denied,nowMs:now
    }),/rejected/);
  } finally {
    await Promise.allSettled([poolA.end(),poolB.end()]);
  }
});
