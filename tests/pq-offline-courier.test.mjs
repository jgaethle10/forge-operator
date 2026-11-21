import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {
  initializeCourierNode,sendSyntheticCourierMessage,receiveSyntheticCourierMessage
} from '../systemia/crypto/pq-offline-courier.mjs';
import {pqRuntime} from '../systemia/crypto/pq-envelope.mjs';

const cli=fileURLToPath(new URL('../systemia/crypto/pq-offline-courier.mjs',import.meta.url));
function withNodePair(fn) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-pq-courier-proof-'));
  try {
    const node1Dir=path.join(root,'node001');
    const node2Dir=path.join(root,'node002');
    const node1=initializeCourierNode({directory:node1Dir,nodeId:'node001'});
    const node2=initializeCourierNode({directory:node2Dir,nodeId:'node002'});
    return fn({root,node1,node2,node1Dir,node2Dir});
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
}

test('offline courier produces separate private identities and validates key fingerprints',
  {skip:!pqRuntime().available},()=>{
  withNodePair(({node1,node2,node1Dir,node2Dir})=>{
    assert.equal(node1.node_id,'node001');
    assert.equal(node2.node_id,'node002');
    assert.match(node1.recipient_key_id,/^[a-f0-9]{64}$/);
    assert.match(node2.sender_key_id,/^[a-f0-9]{64}$/);
    for (const directory of [node1Dir,node2Dir]) {
      assert.equal(fs.statSync(directory).mode&0o077,0);
      for(const file of ['recipient.private.pem','signer.private.pem']) {
        assert.equal(fs.statSync(path.join(directory,file)).mode&0o077,0);
        assert.equal(fs.readFileSync(path.join(directory,file),'utf8').includes('PRIVATE KEY'),true);
      }
      const pub=fs.readFileSync(path.join(directory,'public.json'),'utf8');
      assert.ok(!pub.includes('PRIVATE KEY'));
    }
    assert.throws(()=>initializeCourierNode({directory:node1Dir,nodeId:'node001'}));
    assert.throws(()=>sendSyntheticCourierMessage({
      directory:node1Dir,peerPublicFile:node2.public_file,
      expectedRecipientKeyId:'f'.repeat(64)
    }),/not explicitly pinned/);
    assert.throws(()=>sendSyntheticCourierMessage({
      directory:node1Dir,peerPublicFile:node1.public_file,
      expectedRecipientKeyId:node1.recipient_key_id
    }),/not explicitly pinned/);
  });
});

test('offline physical-courier rehearsal: two directions, duplicate, signature and forged-key denial',
  {skip:!pqRuntime().available},()=>{
  withNodePair(({root,node1,node2,node1Dir,node2Dir})=>{
    const one=sendSyntheticCourierMessage({
      directory:node1Dir,peerPublicFile:node2.public_file,
      expectedRecipientKeyId:node2.recipient_key_id
    });
    assert.ok(fs.existsSync(one.outgoing_file));
    assert.equal(one.to,'node002');
    assert.equal(fs.readFileSync(one.outgoing_file,'utf8').includes('PRIVATE KEY'),false);
    const proof=receiveSyntheticCourierMessage({
      directory:node2Dir,peerPublicFile:node1.public_file,
      expectedSenderKeyId:node1.sender_key_id,messageFile:one.outgoing_file
    });
    assert.equal(proof.accepted,true);
    assert.equal(proof.message,'EVERCRAFT SYNTHETIC FIELD PROOF node001 TO node002');
    assert.equal(proof.replay_protection,'durable-on-this-recipient-only');
    assert.throws(()=>receiveSyntheticCourierMessage({
      directory:node2Dir,peerPublicFile:node1.public_file,
      expectedSenderKeyId:node1.sender_key_id,messageFile:one.outgoing_file
    }),/rejected/);

    // Identity is pinned independently of what a transferred file claims.
    assert.throws(()=>receiveSyntheticCourierMessage({
      directory:node2Dir,peerPublicFile:node1.public_file,
      expectedSenderKeyId:node2.sender_key_id,messageFile:one.outgoing_file
    }),/not explicitly pinned/);

    const fresh=sendSyntheticCourierMessage({
      directory:node1Dir,peerPublicFile:node2.public_file,
      expectedRecipientKeyId:node2.recipient_key_id
    });
    const altered=JSON.parse(fs.readFileSync(fresh.outgoing_file,'utf8'));
    altered.signed_message.payload.sender_id='node002';
    const alteredFile=path.join(root,'tampered.json');
    fs.writeFileSync(alteredFile,JSON.stringify(altered),{mode:0o600,flag:'wx'});
    assert.throws(()=>receiveSyntheticCourierMessage({
      directory:node2Dir,peerPublicFile:node1.public_file,
      expectedSenderKeyId:node1.sender_key_id,messageFile:alteredFile
    }),/rejected/);

    const returnMessage=sendSyntheticCourierMessage({
      directory:node2Dir,peerPublicFile:node1.public_file,
      expectedRecipientKeyId:node1.recipient_key_id
    });
    const back=receiveSyntheticCourierMessage({
      directory:node1Dir,peerPublicFile:node2.public_file,
      expectedSenderKeyId:node2.sender_key_id,messageFile:returnMessage.outgoing_file
    });
    assert.equal(back.message,'EVERCRAFT SYNTHETIC FIELD PROOF node002 TO node001');

    // Transfers cannot silently swap signer or recipient public-key material.
    const tamperedBundle=JSON.parse(fs.readFileSync(node1.public_file,'utf8'));
    tamperedBundle.sender_key_id='f'.repeat(64);
    const publicFile=path.join(root,'altered-public.json');
    fs.writeFileSync(publicFile,JSON.stringify(tamperedBundle),{mode:0o600,flag:'wx'});
    assert.throws(()=>receiveSyntheticCourierMessage({
      directory:node2Dir,peerPublicFile:publicFile,
      expectedSenderKeyId:node1.sender_key_id,messageFile:fresh.outgoing_file
    }),/fingerprint mismatch/);
  });
});

test('offline courier CLI never prints private keys and parses explicit commands',
  {skip:!pqRuntime().available},()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-pq-courier-cli-'));
  try {
    const dir=path.join(root,'node001');
    const run=spawnSync(process.execPath,[cli,'init','--node','node001','--dir',dir],{
      encoding:'utf8',timeout:30000
    });
    assert.equal(run.status,0,run.stderr);
    const output=JSON.parse(run.stdout);
    assert.equal(output.action,'init');
    assert.equal(output.production_ready,false);
    assert.equal(output.node_id,'node001');
    assert.ok(!run.stdout.includes('PRIVATE KEY'));
    assert.equal(fs.statSync(path.join(dir,'recipient.private.pem')).mode&0o077,0);
    const again=spawnSync(process.execPath,[cli,'init','--node','node001','--dir',dir],{
      encoding:'utf8',timeout:30000
    });
    assert.equal(again.status,1);
    assert.equal(again.stderr.trim(),'PQ offline courier denied');
    assert.ok(!again.stderr.includes(root));
  } finally {
    fs.rmSync(root,{recursive:true,force:true});
  }
});
