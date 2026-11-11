import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { provisionSignalResidentIntake } from '../scripts/provision-signal-resident-intake.mjs';
import { startFabricLocalRuntime } from '../systemia/mcp/fabric-local-runtime.mjs';

const scratch=()=>fs.mkdtempSync(path.join(os.tmpdir(),'signal-resident-provision-'));
const uid=process.getuid(),gid=process.getgid();

test('provisioner creates a unique private key once and a usable encrypted store without recording customers',()=>{
  const parent=scratch(),directory=path.join(parent,'signal');
  try{
    const one=provisionSignalResidentIntake({directory,uid,gid});
    assert.equal(one.key_state,'created_once');
    assert.equal(one.secret_exposed,false);
    assert.equal(one.orders_created,0);
    const keyFile=path.join(directory,'key.b64');
    const original=fs.readFileSync(keyFile,'utf8').trim();
    assert.equal(Buffer.from(original,'base64').length,32);
    assert.equal(fs.statSync(keyFile).mode&0o777,0o600);
    for(const p of [directory,path.join(directory,'leads'),
      path.join(directory,'leads','alert-outbox'),path.join(directory,'leads','alert-receipts')])
      assert.equal(fs.statSync(p).mode&0o777,0o700);
    const two=provisionSignalResidentIntake({directory,uid,gid});
    assert.equal(two.key_state,'preserved');
    assert.equal(fs.readFileSync(keyFile,'utf8').trim(),original,'never rotate live key');
  }finally{fs.rmSync(parent,{recursive:true,force:true})}
});
test('old encrypted records with a missing key block regeneration, and insecure key/paths fail closed',()=>{
  const parent=scratch(),directory=path.join(parent,'signal');
  try{
    provisionSignalResidentIntake({directory,uid,gid});
    const secret=path.join(directory,'key.b64');
    fs.writeFileSync(path.join(directory,'leads','ECS-'+'A'.repeat(24)+'.enc'),'private',{mode:0o600});
    fs.unlinkSync(secret);
    assert.throws(()=>provisionSignalResidentIntake({directory,uid,gid}),/signal_encrypted_records_without_key_hold/);
    fs.writeFileSync(secret,crypto.randomBytes(32).toString('base64')+'\n',{mode:0o644});
    assert.throws(()=>provisionSignalResidentIntake({directory,uid,gid}),/signal_intake_key_file_insecure/);
    fs.chmodSync(secret,0o600);
    assert.equal(provisionSignalResidentIntake({directory,uid,gid}).key_state,'preserved');
  }finally{fs.rmSync(parent,{recursive:true,force:true})}
});
test('symlinked private store and mismatched identity are rejected',()=>{
  const parent=scratch(),real=path.join(parent,'real'),link=path.join(parent,'link');
  try{
    fs.mkdirSync(real,{mode:0o700});fs.symlinkSync(real,link);
    assert.throws(()=>provisionSignalResidentIntake({directory:link,uid,gid}),/signal_private_path_not_directory/);
    assert.throws(()=>provisionSignalResidentIntake({directory:path.join(parent,'another'),uid:-1,gid}),/signal_runtime_identity_invalid/);
  }finally{fs.rmSync(parent,{recursive:true,force:true})}
});
test('existing separately managed environment key is preserved, not copied into the repository',()=>{
  const parent=scratch(),directory=path.join(parent,'signal');
  try{
    const r=provisionSignalResidentIntake({directory,uid,gid,externalKeyConfigured:true});
    assert.equal(r.key_state,'external_key_preserved');
    assert.equal(fs.existsSync(path.join(directory,'key.b64')),false);
  }finally{fs.rmSync(parent,{recursive:true,force:true})}
});
test('Fabric runtime can use owner-only private key file without a key in its environment',async()=>{
  const parent=scratch(),directory=path.join(parent,'signal');
  const previous=process.env.EVERCRAFT_SIGNAL_INTAKE_KEY_FILE;
  try{
    provisionSignalResidentIntake({directory,uid,gid});
    process.env.EVERCRAFT_SIGNAL_INTAKE_KEY_FILE=path.join(directory,'key.b64');
    const runtime=await startFabricLocalRuntime({
      host:'127.0.0.1',port:0,catalog:[],faieSurfaceEnabled:false,
      signalLeadsDir:path.join(directory,'leads'),
      signalIntakeKey:undefined
    });
    try{
      const r=await fetch(runtime.url+'/api/signal/readiness');
      assert.equal(r.status,200);
      const body=await r.json();
      assert.equal(body.schema,'evercraft.signal.intake-readiness.v1');
      assert.equal(body.intake_available,true);
      assert.equal(body.payment_ready,false);
      assert.equal(body.payment_verified,false);
    }finally{await runtime.close()}
  }finally{
    if(previous===undefined)delete process.env.EVERCRAFT_SIGNAL_INTAKE_KEY_FILE;
    else process.env.EVERCRAFT_SIGNAL_INTAKE_KEY_FILE=previous;
    fs.rmSync(parent,{recursive:true,force:true});
  }
});
