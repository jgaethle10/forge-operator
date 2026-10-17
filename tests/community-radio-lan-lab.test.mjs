import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {authorizeCommunityRadioLanLab,startCommunityRadioLanLab} from '../systemia/network/community-radio-lan-lab.mjs';

const sample={eth0:[{address:'192.168.12.7',family:'IPv4',internal:false}]};
const hosts=()=>Object.values(os.networkInterfaces()).flatMap(x=>x||[])
  .filter(x=>x.family==='IPv4'&&!x.internal&&/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(x.address))
  .map(x=>x.address);
function fixture(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'radio-lab-ci-'));
  const keypair=crypto.generateKeyPairSync('ed25519');
  const publicKey=keypair.publicKey.export({format:'pem',type:'spki'});
  const wav=Buffer.alloc(44+400);
  wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);
  wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);
  wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);
  wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(400,40);
  fs.writeFileSync(path.join(dir,'test.wav'),wav);
  const data={schema:'evercraft.broadcast.local-bulletin.v1',
    station_name:'Evercraft Simulated Radio Bench',title:'Simulation only for LAN test',
    message:'Synthetic offline test only',approved_at:'2026-10-16T23:00:00Z',
    expires_at:'2026-10-16T23:20:00Z',editor_approval_ref:'simulation-editor',
    local_distribution_rights_ref:'simulation-tone-rights',lab_synthetic_fixture:true,
    audio_file:'test.wav',audio_sha256:'sha256:'+crypto.createHash('sha256').update(wav).digest('hex')};
  const sign=()=>fs.writeFileSync(path.join(dir,'bulletin.json'),JSON.stringify({
    schema:'evercraft.broadcast.signed-local-bulletin.v1',signed_data:data,
    signature:crypto.sign(null,Buffer.from(JSON.stringify(data)),keypair.privateKey).toString('base64')}));
  sign();return {dir,data,publicKey,sign,cleanup:()=>fs.rmSync(dir,{recursive:true,force:true})};
}
test('lab requires deliberate opt-in, never runs as an implicit service',()=>{
  assert.throws(()=>authorizeCommunityRadioLanLab({host:'192.168.12.7',interfaces:sample}),/acknowledgment/);
  assert.equal(authorizeCommunityRadioLanLab({host:'192.168.12.7',operatorAcknowledged:true,interfaces:sample}).synthetic_only,true);
});
test('no wildcard, public IP, loopback, link-local or IPv6 binding',()=>{
  for(const host of ['0.0.0.0','127.0.0.1','8.8.8.8','169.254.3.3','172.32.0.1','::','::1']){
    assert.throws(()=>authorizeCommunityRadioLanLab({host,operatorAcknowledged:true,interfaces:sample}),/private_ipv4/);
  }
});
test('must bind a real assigned non-loopback interface; max fifteen minutes',()=>{
  assert.throws(()=>authorizeCommunityRadioLanLab({host:'192.168.12.8',operatorAcknowledged:true,interfaces:sample}),/local_interface/);
  assert.throws(()=>authorizeCommunityRadioLanLab({host:'192.168.12.7',operatorAcknowledged:true,interfaces:sample,minutes:16}),/lab_duration/);
  assert.throws(()=>authorizeCommunityRadioLanLab({host:'192.168.12.7',operatorAcknowledged:true,interfaces:sample,minutes:0}),/lab_duration/);
});
test('lab refuses even correctly signed but nonsynthetic station material',async()=>{
  const f=fixture();try{f.data.lab_synthetic_fixture=false;f.sign();
    await assert.rejects(()=>startCommunityRadioLanLab({dir:f.dir,publicKey:f.publicKey,host:'192.168.12.7',operatorAcknowledged:true,interfaces:sample,now:()=>new Date('2026-10-16T23:10:00Z')}),/synthetic_lab_material/);
  }finally{f.cleanup();}
});
test('real private-interface lab: unauthenticated denied, consented join enables local page and WAV',async(t)=>{
  const host=hosts()[0];if(!host){t.skip('No private IPv4 on runner; negative binding rules still tested');return;}
  const f=fixture();let portal;try{
    portal=await startCommunityRadioLanLab({dir:f.dir,publicKey:f.publicKey,host,operatorAcknowledged:true,minutes:1,now:()=>new Date('2026-10-16T23:10:00Z')});
    assert.equal(portal.server.address().address,host);
    assert.equal((await fetch(portal.origin+'/')).status,403);
    assert.equal((await fetch(portal.origin+'/audio')).status,403);
    const join=await fetch(portal.join_url,{redirect:'manual'});
    assert.equal(join.status,303);
    const cookie=join.headers.get('set-cookie').split(';')[0];
    assert.ok(cookie.startsWith('evercraft_lab='));
    const page=await fetch(portal.origin+'/',{headers:{cookie}});
    assert.equal(page.status,200);
    assert.match(await page.text(),/Simulated Radio Bench/);
    const wave=await fetch(portal.origin+'/audio',{headers:{cookie,range:'bytes=0-3'}});
    assert.equal(wave.status,206);assert.equal(await wave.text(),'RIFF');
    assert.equal((await fetch(portal.origin+'/api/control',{headers:{cookie}})).status,404);
    assert.equal((await fetch(portal.origin+'/',{method:'POST',headers:{cookie}})).status,405);
    assert.equal((await fetch(portal.origin+'/audio',{headers:{cookie:'evercraft_lab='+'0'.repeat(64)}})).status,403);
    f.data.lab_synthetic_fixture=false;f.sign();
    assert.equal((await fetch(portal.origin+'/',{headers:{cookie}})).status,503);
  }finally{if(portal)await portal.stop();f.cleanup();}
});
