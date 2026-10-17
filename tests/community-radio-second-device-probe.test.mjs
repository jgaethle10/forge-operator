import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {startCommunityRadioLanLab} from '../systemia/network/community-radio-lan-lab.mjs';
import {validateCommunityRadioJoinUrl,probeCommunityRadioSecondDevice} from '../systemia/network/community-radio-second-device-probe.mjs';

const privateIPs=()=>Object.values(os.networkInterfaces()).flatMap(x=>x||[])
  .filter(x=>x.family==='IPv4'&&!x.internal&&/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(x.address))
  .map(x=>x.address);
function fixture(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-radio-listener-probe-'));
  const keys=crypto.generateKeyPairSync('ed25519');
  const publicKey=keys.publicKey.export({type:'spki',format:'pem'});
  const wav=Buffer.alloc(44+800);
  wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);
  wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);
  wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);
  wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(800,40);
  fs.writeFileSync(path.join(dir,'demo.wav'),wav);
  const t=Date.now(),data={
    schema:'evercraft.broadcast.local-bulletin.v1',
    station_name:'Evercraft Simulated Field Bench',title:'Simulation for second device',
    message:'Synthetic offline sound test, not a real station',
    approved_at:new Date(t-1000).toISOString(),expires_at:new Date(t+120000).toISOString(),
    editor_approval_ref:'demo-editor-approves',local_distribution_rights_ref:'demo-original-tone-rights',
    lab_synthetic_fixture:true,audio_file:'demo.wav',
    audio_sha256:'sha256:'+crypto.createHash('sha256').update(wav).digest('hex'),
  };
  const sign=()=>fs.writeFileSync(path.join(dir,'bulletin.json'),JSON.stringify({
    schema:'evercraft.broadcast.signed-local-bulletin.v1',signed_data:data,
    signature:crypto.sign(null,Buffer.from(JSON.stringify(data)),keys.privateKey).toString('base64')
  }));
  sign();
  return {dir,publicKey,data,wav,sign,clean:()=>fs.rmSync(dir,{recursive:true,force:true})};
}
test('rejects absent consent and unbounded or nonprivate URLs before any network call',()=>{
  const token='a'.repeat(64),candidate='http://192.168.5.20:1234/join/'+token;
  assert.throws(()=>validateCommunityRadioJoinUrl(candidate),/consent_required/);
  assert.equal(validateCommunityRadioJoinUrl(candidate,{acknowledged:true}).host,'192.168.5.20');
  const denied=[
    'https://192.168.5.20:1234/join/'+token,
    'http://8.8.8.8:1234/join/'+token,
    'http://127.0.0.1:1234/join/'+token,
    'http://169.254.5.5:1234/join/'+token,
    'http://example.com:1234/join/'+token,
    'http://0.0.0.0:1234/join/'+token,
    'http://192.168.5.20/join/'+token,
    'http://192.168.5.20:1234/health',
    candidate+'?x=1',candidate+'#frag',
    'http://user:pass@192.168.5.20:1234/join/'+token,
  ];
  for(const url of denied)assert.throws(()=>validateCommunityRadioJoinUrl(url,{acknowledged:true}),/only_explicit_private/);
});
test('synthetic private LAN probe verifies join, page, WAV, and excludes bearer from receipt',async t=>{
  const ip=privateIPs()[0];if(!ip){t.skip('Runner lacks RFC1918 interface: HTTP probe cannot exercise real private bind');return;}
  const f=fixture();let portal;
  try{
    portal=await startCommunityRadioLanLab({dir:f.dir,publicKey:f.publicKey,host:ip,operatorAcknowledged:true,minutes:1});
    const report=await probeCommunityRadioSecondDevice({joinUrl:portal.join_url,acknowledged:true});
    assert.equal(report.state,'observed_synthetic_lan_http_only');
    assert.equal(report.audio_range_http_status,206);
    assert.equal(report.anonymous_http_status,403);
    assert.equal(report.audio_sha256,f.data.audio_sha256);
    assert.equal(report.audio_length_bytes,f.wav.length);
    assert.equal(report.independently_verified_distinct_devices,false);
    assert.equal(report.client_internet_outage_verified,false);
    assert.equal(report.audible_playback_verified,false);
    assert.equal(report.token_recorded,false);
    assert.equal(report.cookie_recorded,false);
    const serialized=JSON.stringify(report);
    assert.ok(!serialized.includes(portal.join_url.split('/').at(-1)));
    assert.ok(!serialized.includes('evercraft_lab='));
    assert.match(report.probe_receipt_sha256,/^sha256:[a-f0-9]{64}$/);
    const invalid=portal.join_url.slice(0,-1)+(portal.join_url.endsWith('0')?'1':'0');
    await assert.rejects(()=>probeCommunityRadioSecondDevice({joinUrl:invalid,acknowledged:true}),/join_not_approved/);
    fs.writeFileSync(path.join(f.dir,'demo.wav'),'tampered');
    await assert.rejects(()=>probeCommunityRadioSecondDevice({joinUrl:portal.join_url,acknowledged:true}),/synthetic_lab_page_unverified/);
  }finally{if(portal)await portal.stop();f.clean();}
});
test('probe rejects external redirect responses and never follows them',async()=>{
  const url='http://192.168.44.50:9876/join/'+'b'.repeat(64);
  let calls=0;
  const request=async(requested,opts)=>{
    calls++;
    assert.equal(opts.redirect,'manual');
    if(calls===1)return new Response('blocked',{status:403});
    return new Response('',{status:302,headers:{location:'https://example.com/'}});
  };
  await assert.rejects(()=>probeCommunityRadioSecondDevice({joinUrl:url,acknowledged:true,request}),/join_not_approved/);
  assert.equal(calls,2);
});
test('probe enforces response size ceilings before consuming untrusted remote body',async()=>{
  const url='http://192.168.44.50:9876/join/'+'b'.repeat(64);
  const request=async()=>new Response('large',{status:403,headers:{'content-length':'10000000'}});
  await assert.rejects(()=>probeCommunityRadioSecondDevice({joinUrl:url,acknowledged:true,request}),/response_too_large/);
});
