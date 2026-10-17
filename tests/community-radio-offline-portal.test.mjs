import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {verifyLocalRadioPackage,startLocalRadioPortal} from '../systemia/network/community-radio-offline-portal.mjs';
import {createCommunityRadioClockGuard} from '../systemia/network/community-radio-clock-guard.mjs';

const time='2026-10-16T23:00:00Z';
function fixture(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-local-radio-test-'));
  const pair=crypto.generateKeyPairSync('ed25519');
  const publicKey=pair.publicKey.export({format:'pem',type:'spki'});
  const audio=Buffer.alloc(44+1600);
  audio.write('RIFF',0);audio.writeUInt32LE(audio.length-8,4);audio.write('WAVEfmt ',8);
  audio.writeUInt32LE(16,16);audio.writeUInt16LE(1,20);audio.writeUInt16LE(1,22);
  audio.writeUInt32LE(8000,24);audio.writeUInt32LE(16000,28);audio.writeUInt16LE(2,32);
  audio.writeUInt16LE(16,34);audio.write('data',36);audio.writeUInt32LE(1600,40);
  for(let i=0;i<800;i++)audio.writeInt16LE(Math.round(3000*Math.sin(2*Math.PI*440*i/8000)),44+i*2);
  fs.writeFileSync(path.join(dir,'fixture.wav'),audio);
  const b={schema:'evercraft.broadcast.local-bulletin.v1',station_name:'DEMO RADIO, NOT A REAL STATION',title:'Synthetic local audio test',message:'Simulation only. <script>not real</script>',approved_at:'2026-10-16T22:00:00Z',expires_at:'2026-10-17T00:00:00Z',editor_approval_ref:'fixture-editor',local_distribution_rights_ref:'fixture-rights',audio_file:'fixture.wav',audio_sha256:'sha256:'+crypto.createHash('sha256').update(audio).digest('hex')};
  const sign=()=>{const signature=crypto.sign(null,Buffer.from(JSON.stringify(b)),pair.privateKey).toString('base64');fs.writeFileSync(path.join(dir,'bulletin.json'),JSON.stringify({schema:'evercraft.broadcast.signed-local-bulletin.v1',signed_data:b,signature}));};
  sign();return{dir,b,publicKey,sign,close:()=>fs.rmSync(dir,{recursive:true,force:true})};
}
async function withServer(fn){const f=fixture();let server;try{const portal=await startLocalRadioPortal({dir:f.dir,publicKey:f.publicKey,now:()=>new Date(time)});server=portal.server;await fn(f,portal);}finally{if(server)await new Promise(ok=>server.close(ok));f.close();}}
test('a trusted signed bulletin with fresh rights-approved audio passes offline',()=>{const f=fixture();try{const b=verifyLocalRadioPackage({dir:f.dir,publicKey:f.publicKey,now:time});assert.equal(b.station,f.b.station_name);assert.equal(b.audio.bytes.length,1644);assert.match(b.hash,/^sha256:/);}finally{f.close();}});
test('forged content or untrusted station key is rejected',()=>{const f=fixture();try{const wrong=crypto.generateKeyPairSync('ed25519').publicKey.export({format:'pem',type:'spki'});assert.throws(()=>verifyLocalRadioPackage({dir:f.dir,publicKey:wrong,now:time}),/signature/);f.b.title='forged title';assert.throws(()=>{fs.writeFileSync(path.join(f.dir,'bulletin.json'),JSON.stringify({schema:'evercraft.broadcast.signed-local-bulletin.v1',signed_data:f.b,signature:'A'.repeat(88)}));verifyLocalRadioPackage({dir:f.dir,publicKey:f.publicKey,now:time});},/signature/);}finally{f.close();}});
test('expired, future or overly long messages are rejected',()=>{const f=fixture();try{for(const [approved_at,expires_at] of [['2026-10-15T20:00:00Z','2026-10-16T22:59:59Z'],['2026-10-17T00:00:00Z','2026-10-17T01:00:00Z'],['2026-10-15T20:00:00Z','2026-10-17T00:00:00Z']]){f.b.approved_at=approved_at;f.b.expires_at=expires_at;f.sign();assert.throws(()=>verifyLocalRadioPackage({dir:f.dir,publicKey:f.publicKey,now:time}),/expired_or_future/);}}finally{f.close();}});
test('rights or editor approval missing fails closed',()=>{const f=fixture();try{f.b.local_distribution_rights_ref='';f.sign();assert.throws(()=>verifyLocalRadioPackage({dir:f.dir,publicKey:f.publicKey,now:time}),/rights/);f.b.local_distribution_rights_ref='fixture-rights';f.b.editor_approval_ref='';f.sign();assert.throws(()=>verifyLocalRadioPackage({dir:f.dir,publicKey:f.publicKey,now:time}),/rights/);}finally{f.close();}});
test('tampered audio, symlink escape or traversal name fails closed',()=>{const f=fixture();try{fs.writeFileSync(path.join(f.dir,'fixture.wav'),'not authorized');assert.throws(()=>verifyLocalRadioPackage({dir:f.dir,publicKey:f.publicKey,now:time}),/tampered_audio/);fs.rmSync(path.join(f.dir,'fixture.wav'));fs.symlinkSync('/etc/hosts',path.join(f.dir,'fixture.wav'));assert.throws(()=>verifyLocalRadioPackage({dir:f.dir,publicKey:f.publicKey,now:time}),/invalid_package_file/);f.b.audio_file='../etc/passwd.wav';f.sign();assert.throws(()=>verifyLocalRadioPackage({dir:f.dir,publicKey:f.publicKey,now:time}),/invalid_package_filename/);}finally{f.close();}});
test('HTTP listener is loopback-only and plays a byte-range of local WAV',async()=>withServer(async(f,p)=>{assert.equal(p.server.address().address,'127.0.0.1');const page=await fetch(p.origin+'/');assert.equal(page.status,200);const html=await page.text();assert.match(html,/Locally cached recording/);assert.match(html,/&lt;script&gt;not real&lt;\/script&gt;/);assert.doesNotMatch(html,/<script>not real<\/script>/);const audio=await fetch(p.origin+'/audio',{headers:{range:'bytes=0-3'}});assert.equal(audio.status,206);assert.equal(audio.headers.get('content-range'),'bytes 0-3/1644');assert.equal(await audio.text(),'RIFF');const h=await fetch(p.origin+'/health');const status=await h.json();assert.equal(status.fm_broadcast,false);assert.equal(status.public_access,false);}));
test('no mutating routes, device enrollment or arbitrary filesystem exposure',async()=>withServer(async(f,p)=>{assert.equal((await fetch(p.origin+'/',{method:'POST'})).status,405);assert.equal((await fetch(p.origin+'/api/enroll')).status,404);assert.equal((await fetch(p.origin+'/etc/passwd')).status,404);assert.equal((await fetch(p.origin+'/audio',{headers:{range:'bytes=999999-999999'}})).status,416);}));
test('already-running service refuses stale or subsequently corrupted bulletin',async()=>{const f=fixture();let server;let now=time;try{const p=await startLocalRadioPortal({dir:f.dir,publicKey:f.publicKey,now:()=>new Date(now)});server=p.server;now='2026-10-17T01:00:00Z';assert.equal((await fetch(p.origin+'/')).status,503);now=time;fs.writeFileSync(path.join(f.dir,'fixture.wav'),'corrupted');assert.equal((await fetch(p.origin+'/audio')).status,503);}finally{if(server)await new Promise(ok=>server.close(ok));f.close();}});

test('persisted clock rollback fails closed on already-started signed audio portal',async()=>{const f=fixture();let server;try{
 const stateDir=path.join(f.dir,'private-state');fs.mkdirSync(stateDir,{mode:0o700});let clock=time;
 const guard=createCommunityRadioClockGuard({stateDir,initialize:true,now:clock});
 const portal=await startLocalRadioPortal({dir:f.dir,publicKey:f.publicKey,clockGuard:guard,now:()=>new Date(clock)});server=portal.server;
 assert.equal((await fetch(portal.origin+'/')).status,200);
 clock='2026-10-16T23:05:00Z';assert.equal((await fetch(portal.origin+'/audio')).status,200);
 clock='2026-10-16T23:00:00Z';assert.equal((await fetch(portal.origin+'/audio')).status,503);
 assert.throws(()=>createCommunityRadioClockGuard({stateDir,now:clock}),/wall_clock_rollback/);
 }finally{if(server)await new Promise(ok=>server.close(ok));f.close();}});
