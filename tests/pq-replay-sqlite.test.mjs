import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createLocalSqliteReplayGuard} from '../systemia/crypto/pq-replay-sqlite.mjs';
import {generatePqRecipient,pqRuntime} from '../systemia/crypto/pq-envelope.mjs';
import {generatePqSigner,signAndEncryptPqMessage,openSignedPqMessage} from '../systemia/crypto/pq-signed-envelope.mjs';

const modulePath=fileURLToPath(new URL('../systemia/crypto/pq-replay-sqlite.mjs',import.meta.url));
const input=(nonce='same')=>({
  senderId:'alice',senderKeyId:'a'.repeat(64),context:'lab.route',nonce,
  nowMs:1_000_000,expiresAtMs:1_200_000
});
function withTempFile(fn) {
  const root=mkdtempSync(path.join(tmpdir(),'evercraft-pq-replay-'));
  try {return fn(path.join(root,'replay.sqlite'));} finally {rmSync(root,{recursive:true,force:true});}
}

test('SQLite replay guard persists across restarts and fails closed at capacity',()=>{
  withTempFile(file=>{
    assert.throws(()=>createLocalSqliteReplayGuard({filePath:'relative.sqlite'}),/absolute/);
    const guard=createLocalSqliteReplayGuard({filePath:file,maxEntries:1});
    assert.equal(guard.consume(input('first')),true);
    assert.equal(guard.consume(input('first')),false);
    assert.equal(guard.consume(input('other')),false);
    assert.equal(guard.size(),1);
    guard.close();
    assert.equal(guard.consume(input('third')),false);
    const restarted=createLocalSqliteReplayGuard({filePath:file,maxEntries:1});
    assert.equal(restarted.consume(input('first')),false);
    assert.equal(restarted.consume({...input('new'),nowMs:1_200_000,expiresAtMs:1_300_000}),true);
    assert.equal(restarted.consume({...input('bad'),expiresAtMs:1_000_000}),false);
    assert.equal(restarted.consume({...input('bad'),senderId:''}),false);
    restarted.close();
  });
});

test('SQLite ledger coordinates concurrent local processes via one unique key', async()=>{
  const root=mkdtempSync(path.join(tmpdir(),'evercraft-pq-concurrent-'));
  const file=path.join(root,'replay.sqlite');
  try {
    // Pre-initialize schema before the independent processes race to insert.
    createLocalSqliteReplayGuard({filePath:file}).close();
    const script='import {createLocalSqliteReplayGuard} from '+JSON.stringify('file://'+modulePath)+';'+
      'const guard=createLocalSqliteReplayGuard({filePath:process.argv[1]});'+
      'const ok=guard.consume('+JSON.stringify(input('concurrent'))+');'+
      'guard.close(); process.stdout.write(ok ? "1" : "0");';
    const run=()=>new Promise((resolve,reject)=>{
      const child=spawn(process.execPath,['--input-type=module','-e',script,file],{
        stdio:['ignore','pipe','pipe']
      });
      let out='',err='';
      child.stdout.on('data',b=>{out+=b;});
      child.stderr.on('data',b=>{err+=b;});
      child.on('error',reject);
      child.on('close',code=>code===0?resolve(out.trim()):reject(new Error('Worker exit '+code+': '+err.slice(-1000))));
    });
    const accepted=await Promise.all(Array.from({length:6},run));
    assert.equal(accepted.filter(v=>v==='1').length,1);
    assert.equal(accepted.filter(v=>v==='0').length,5);
  } finally {rmSync(root,{recursive:true,force:true});}
});

test('signed ML-DSA envelope cannot be replayed after SQLite ledger restart',{skip:!pqRuntime().available},()=>{
  withTempFile(file=>{
    const sender=generatePqSigner();
    const recipient=generatePqRecipient();
    const now=Date.now();
    const signed=signAndEncryptPqMessage({
      senderPrivateKey:sender.privateKey,sender:'alice',recipientPublicKey:recipient.publicKey,
      plaintext:'persistent replay proof',context:'systemia.lab.persistent',nowMs:now,ttlSeconds:60
    });
    const open=replayGuard=>openSignedPqMessage({
      signedMessage:signed,senderPublicKey:sender.publicKey,expectedSender:'alice',
      recipientPrivateKey:recipient.privateKey,expectedContext:'systemia.lab.persistent',
      replayGuard,nowMs:now
    });
    const first=createLocalSqliteReplayGuard({filePath:file});
    assert.equal(open(first).plaintext.toString(),'persistent replay proof');
    first.close();
    const second=createLocalSqliteReplayGuard({filePath:file});
    assert.throws(()=>open(second),/rejected/);
    second.close();
  });
});
