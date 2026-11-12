import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {
  encodePrivateEvidenceEnvelope,writePrivateEvidence
} from './eo001-private-evidence-vault.mjs';

const revision='a'.repeat(40);
const synthetic=()=>({
  schema:'evercraft.eo001.gate1.private-negative-observation.v1',
  state:'SCOPE_LIFECYCLE_OBSERVATION_BLOCKED',
  reason:'POSTSTOP_KERNEL_EVIDENCE_MISSING',
  execution_authorized:false,
  collector_independence_attested:false,
  note:'synthetic CI fixture only'
});
const make=()=>encodePrivateEvidenceEnvelope({
  category:'supervisor-negative',
  sourceRevision:revision,receipt:synthetic()
});
function withOwnedDirectory(fn){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'eo001-private-fixture-'));
  try{return fn(dir);}finally{fs.rmSync(dir,{recursive:true,force:true});}
}

test('write-once private archive has exact digest, owner-only file and no authority',()=>{
  withOwnedDirectory(dir=>{
    const env=make();
    const result=writePrivateEvidence({directory:dir,envelope:env});
    assert.equal(result.state,'PRIVATE_LOCAL_RECEIPT_WRITTEN_NOT_ATTESTED');
    assert.equal(result.sha256,env.sha256);
    assert.equal(result.external_actions_authorized,false);
    assert.equal(result.local_file_tamper_resistant,false);
    assert.equal(result.observer_provenance_authenticated,false);
    assert.equal(result.permission_mode,'0600');
    const filename=path.join(dir,result.filename);
    assert.equal(fs.statSync(filename).mode&0o777,0o600);
    const bytes=fs.readFileSync(filename);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),env.sha256);
    assert.deepEqual(JSON.parse(bytes.toString()).receipt,synthetic());
    assert.equal(JSON.parse(bytes.toString()).evidence_provenance_authenticated,false);
    assert.throws(()=>writePrivateEvidence({directory:dir,envelope:env}),
      /PRIVATE_RECEIPT_ALREADY_ARCHIVED/);
    assert.deepEqual(fs.readdirSync(dir),[result.filename]);
  });
});

test('cannot replace receipt content while keeping a filename or hash',()=>{
  withOwnedDirectory(dir=>{
    const e=make();
    const edited=Buffer.from(e.bytes);
    edited[3]=edited[3]===97?98:97;
    assert.throws(()=>writePrivateEvidence({
      directory:dir,envelope:{...e,bytes:edited}
    }),/PRIVATE_RECEIPT_CONTENT_CHANGED/);
    assert.throws(()=>writePrivateEvidence({
      directory:dir,envelope:{...e,filename:'other.json'}
    }),/PRIVATE_RECEIPT_INPUT_INVALID/);
    assert.equal(fs.readdirSync(dir).length,0);
  });
});

test('symlink destination folder rejected even if target is owned private',()=>{
  withOwnedDirectory(dir=>{
    const link=dir+'-link';
    fs.symlinkSync(dir,link,'dir');
    try{
      assert.throws(()=>writePrivateEvidence({directory:link,envelope:make()}),
        /PRIVATE_RECEIPT_DIRECTORY_UNTRUSTED/);
      assert.deepEqual(fs.readdirSync(dir),[]);
    }finally{fs.unlinkSync(link);}
  });
});

test('missing directory and group accessible directory fail closed',()=>{
  withOwnedDirectory(dir=>{
    assert.throws(()=>writePrivateEvidence({
      directory:path.join(dir,'does-not-exist'),envelope:make()
    }),/PRIVATE_RECEIPT_DIRECTORY_UNAVAILABLE/);
    fs.chmodSync(dir,0o750);
    assert.throws(()=>writePrivateEvidence({
      directory:dir,envelope:make()
    }),/PRIVATE_RECEIPT_DIRECTORY_UNTRUSTED/);
    fs.chmodSync(dir,0o700);
    assert.equal(fs.readdirSync(dir).length,0);
  });
});

test('malformed category, source pin and invalid receipts are rejected',()=>{
  for(const candidate of [
    {category:'other',sourceRevision:revision,receipt:synthetic()},
    {category:'supervisor-negative',sourceRevision:'main',receipt:synthetic()},
    {category:'supervisor-negative',sourceRevision:revision,receipt:null},
    {category:'supervisor-negative',sourceRevision:revision,receipt:[]}
  ]) assert.throws(()=>encodePrivateEvidenceEnvelope(candidate),
    /PRIVATE_RECEIPT_ENVELOPE_INVALID/);
  assert.throws(()=>encodePrivateEvidenceEnvelope({
    category:'supervisor-negative',sourceRevision:revision,
    receipt:{huge:'x'.repeat(262144)}
  }),/PRIVATE_RECEIPT_OVERSIZED/);
  assert.throws(()=>encodePrivateEvidenceEnvelope({
    category:'supervisor-negative',sourceRevision:revision,
    receipt:{value:9n}
  }),/PRIVATE_RECEIPT_NOT_SERIALIZABLE/);
});

test('invalid relative path and fabricated opaque envelope refuse file creation',()=>{
  withOwnedDirectory(dir=>{
    assert.throws(()=>writePrivateEvidence({
      directory:'../tmp',envelope:make()
    }),/PRIVATE_RECEIPT_DIRECTORY_INVALID/);
    assert.throws(()=>writePrivateEvidence({
      directory:dir,envelope:{
        bytes:Buffer.from('fake'),sha256:'0'.repeat(64),
        filename:'eo001-private-'+'0'.repeat(64)+'.json'
      }
    }),/PRIVATE_RECEIPT_CONTENT_CHANGED/);
    assert.equal(fs.readdirSync(dir).length,0);
  });
});
