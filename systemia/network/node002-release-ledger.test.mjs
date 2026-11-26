import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {generateKeyPairSync,sign} from 'node:crypto';
import {releaseGrantBytes} from './node002-release-authorization.mjs';
import {admitReleaseGrant} from './node002-release-ledger.mjs';
function fixture(t){
 const directory=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'node002-ledger-'));
 fs.chmodSync(directory,0o700);
 t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const {privateKey,publicKey}=generateKeyPairSync('ed25519');
 const file=path.join(directory,'ledger.json');
 fs.writeFileSync(file,JSON.stringify({schema:'evercraft.node002.release-ledger.v1',last_sequence:0}),{mode:0o600});
 fs.writeFileSync(path.join(directory,'owner-public.pem'),publicKey.export({type:'spki',format:'pem'}),{mode:0o600});
 const nowMs=Date.parse('2026-11-25T00:00:00Z');
 function request(sequence){
 const grant={schema:'evercraft.node002.release-grant.v1',repository:'jgaethle10/forge-operator',node_id:'evercraft-node002-nextgen',commit:'a'.repeat(40),operation:'stage-only',phase:'cemetery-restore',sequence,issued_at:'2026-11-24T23:00:00Z',expires_at:'2026-11-25T01:00:00Z'};
 return {directory,grant,signature:sign(null,releaseGrantBytes(grant),privateKey).toString('base64'),nowMs};
 }
 return {directory,file,request,lock:path.join(directory,'admission.lock')};
}
test('persists sequence and refuses replay without blocking next grant',t=>{
 const f=fixture(t);
 const first=admitReleaseGrant(f.request(1));
 assert.equal(first.activation_authorized,false);
 assert.equal(JSON.parse(fs.readFileSync(f.file)).last_sequence,1);
 assert.equal(fs.statSync(f.file).mode&0o777,0o600);
 assert.throws(()=>admitReleaseGrant(f.request(1)),/sequence_denied/);
 assert.equal(fs.existsSync(f.lock),false);
 assert.equal(admitReleaseGrant(f.request(2)).last_sequence,2);
});
test('bad signature does not consume sequence or leave lock',t=>{
 const f=fixture(t);
 const request=f.request(1);
 assert.throws(()=>admitReleaseGrant({...request,signature:Buffer.alloc(64).toString('base64')}),/signature_denied/);
 assert.equal(JSON.parse(fs.readFileSync(f.file)).last_sequence,0);
 assert.equal(fs.existsSync(f.lock),false);
 assert.equal(admitReleaseGrant(request).last_sequence,1);
});
test('existing admission lock blocks processing without deleting it',t=>{
 const f=fixture(t);
 fs.writeFileSync(f.lock,'held',{mode:0o600});
 assert.throws(()=>admitReleaseGrant(f.request(1)),/EEXIST/);
 assert.equal(fs.readFileSync(f.lock,'utf8'),'held');
});
test('missing ledger cannot silently initialize sequence',t=>{
 const f=fixture(t);
 fs.unlinkSync(f.file);
 assert.throws(()=>admitReleaseGrant(f.request(1)),/ENOENT/);
 assert.equal(fs.existsSync(f.file),false);
});
test('public permissions and symlink ledger rejected',t=>{
 const f=fixture(t);
 fs.chmodSync(f.file,0o644);
 assert.throws(()=>admitReleaseGrant(f.request(1)),/ledger_file_invalid/);
 fs.chmodSync(f.file,0o600);
 fs.renameSync(f.file,f.file+'.saved');
 fs.symlinkSync(f.file+'.saved',f.file);
 assert.throws(()=>admitReleaseGrant(f.request(1)),/ELOOP/);
});
