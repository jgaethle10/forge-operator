import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createAuditionPack,generateLocalTake,inspectAudio,SCHEMA} from './commercial-music-open-source-bridge.mjs';

const pack=createAuditionPack();
test('two distinct restaurant projects and six musical directions',()=>{
 assert.equal(pack.schema,SCHEMA);
 assert.equal(pack.takes.length,6);
 assert.equal(new Set(pack.takes.map(t=>t.id)).size,6);
 assert.deepEqual([...new Set(pack.takes.map(t=>t.brand))].sort(),['Flame & Brew','Icy Tai']);
 for(const t of pack.takes){
  assert.equal(t.provider_request.lyrics,'[Instrumental]');
  assert.equal(t.provider_request.instrumental,true);
  assert.equal(t.provider_request.audio_duration,32);
  assert.equal(t.provider_request.audio_format,'wav');
  assert.equal(t.creative_route,'audition_only');
 }
});
const response=(data)=>({ok:true,headers:new Map(),json:async()=>({code:200,error:null,data}),
 arrayBuffer:async()=>Buffer.from('fixture_wav_bytes')});
test('local mock ACE-Step task produces a quarantined receipt, not approval',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-ace-step-'));
 try{
  const result=await generateLocalTake(pack.takes[0],path.join(dir,'take.wav'),{
   pauseMs:0,pollLimit:2,
   fetcher:async(url,request)=>{
    if(url.endsWith('/release_task'))return response({task_id:'test-123',status:'queued'});
    if(url.endsWith('/query_result'))return response([{status:1,result:JSON.stringify([{file:'/v1/audio?path=%2Fmedia%2Ftest.wav'}])}]);
    assert.match(url,/^http:\/\/127\.0\.0\.1:8001\/v1\/audio\?path=/);
    assert.equal(request.method,'GET');
    return response(null);
   }});
  assert.equal(result.review_state,'HOLD_FOR_TECHNICAL_AND_HUMAN_REVIEW');
  assert.equal(result.rights_state,'UNVERIFIED');
  assert.equal(result.published,false);
  assert.ok(fs.statSync(result.output).size>0);
  await assert.rejects(generateLocalTake(pack.takes[0],result.output,{fetcher:async()=>response({})}),/refusing_to_overwrite/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('remote music server is forbidden even with mocked responses',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-remote-'));
 try{
  await assert.rejects(generateLocalTake(pack.takes[0],path.join(dir,'test.wav'),
    {baseUrl:'https://untrusted.example.org',fetcher:async()=>response({})}),/only_owned_loopback/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('refuses provider-supplied off-host audio URLs',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-url-'));
 try{
  await assert.rejects(generateLocalTake(pack.takes[0],path.join(dir,'test.wav'),{
   pauseMs:0,pollLimit:1,
   fetcher:async(url)=>{
    if(url.endsWith('/release_task'))return response({task_id:'abc'});
    return response([{status:1,result:JSON.stringify([{file:'https://other.example.com/track.wav'}])}]);
   }}),/audio_download_path_not_authorized/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('audio inspector technical pass is not creative approval',()=>{
 execFileSync('ffprobe',['-version'],{stdio:'ignore'});
 execFileSync('ffmpeg',['-version'],{stdio:'ignore'});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-inspect-'));
 try{
  const file=path.join(dir,'test.wav');
  execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=30',
    '-ac','2',file],{timeout:25000});
  const audit=inspectAudio(file);
  assert.equal(audit.technical_state,'CANDIDATE_TECHNICAL_PASS');
  assert.equal(audit.creative_state,'NOT_LISTENED_OR_APPROVED');
  assert.equal(audit.release_state,'BLOCKED');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
