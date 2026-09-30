import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createYouTubePublisherAdapter } from './youtube-publisher.mjs';

const digest=(file)=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function response(status,{headers={},body={}}={}){
  const lower=Object.fromEntries(Object.entries(headers).map(([k,v])=>[k.toLowerCase(),v]));
  return {
    status,
    headers:{get(name){return lower[String(name).toLowerCase()]??null;}},
    async text(){return body===null?'':typeof body==='string'?body:JSON.stringify(body);},
  };
}

test('uploads a video through a resumable YouTube session in 256KB chunks',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'clip-youtube-'));
  const file=path.join(root,'master.mp4');
  fs.writeFileSync(file,Buffer.alloc(600000,7));
  const calls=[];
  const session='https://upload.example/session-1';
  const fetchImpl=async(url,init={})=>{
    calls.push({url,method:init.method,headers:init.headers,body:init.body});
    if(init.method==='POST'){
      return response(200,{headers:{Location:session},body:null});
    }
    const range=init.headers?.['Content-Range'];
    if(range==='bytes 0-262143/600000'){
      return response(308,{headers:{Range:'bytes=0-262143'},body:null});
    }
    if(range==='bytes 262144-524287/600000'){
      return response(308,{headers:{Range:'bytes=0-524287'},body:null});
    }
    if(range==='bytes 524288-599999/600000'){
      return response(201,{body:{id:'video-123',status:{privacyStatus:'private'}}});
    }
    throw new Error('unexpected request '+init.method+' '+url+' '+range);
  };

  const adapter=createYouTubePublisherAdapter({
    accessToken:'token',
    verified:true,
    allowPublish:true,
    chunkSizeBytes:256*1024,
    retryBaseMs:0,
    fetchImpl,
  });
  const result=await adapter.publish({
    requestId:'publish-1',
    mediaPath:file,
    mediaSha256:digest(file),
    metadata:{
      title:'World in Motion',
      description:'Proof-backed video.',
      tags:['evercraft','fallen'],
      privacyStatus:'public',
    },
    brandKey:'evercraft-journal',
    authorizationRef:'policy:clip-autopublish',
  });

  assert.equal(result.state,'published');
  assert.equal(result.remoteId,'video-123');
  assert.equal(result.observedPrivacyStatus,'private');
  assert.equal(result.mediaSha256,digest(file));
  assert.equal(calls.filter(call=>call.method==='PUT').length,3);
  const init=JSON.parse(calls[0].body);
  assert.equal(init.snippet.title,'World in Motion');
  assert.equal(init.status.privacyStatus,'public');
  assert.equal(calls[0].headers['X-Upload-Content-Length'],'600000');
});

test('paid or live publishing requires explicit adapter authorization before network calls',async()=>{
  let called=false;
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'clip-youtube-auth-'));
  const file=path.join(root,'master.mp4');
  fs.writeFileSync(file,'video');
  const adapter=createYouTubePublisherAdapter({
    accessToken:'token',
    verified:true,
    allowPublish:false,
    fetchImpl:async()=>{called=true;throw new Error('should not call');},
  });
  await assert.rejects(()=>adapter.publish({
    requestId:'publish-2',
    mediaPath:file,
    mediaSha256:digest(file),
    metadata:{title:'No'},
    brandKey:'evercraft',
    authorizationRef:'policy:test',
  }),/youtube_publish_not_authorized/);
  assert.equal(called,false);
});

test('media digest is reverified before starting a YouTube session',async()=>{
  let called=false;
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'clip-youtube-digest-'));
  const file=path.join(root,'master.mp4');
  fs.writeFileSync(file,'video');
  const adapter=createYouTubePublisherAdapter({
    accessToken:'token',
    verified:true,
    allowPublish:true,
    fetchImpl:async()=>{called=true;throw new Error('should not call');},
  });
  await assert.rejects(()=>adapter.publish({
    requestId:'publish-3',
    mediaPath:file,
    mediaSha256:'0'.repeat(64),
    metadata:{title:'No'},
    brandKey:'evercraft',
    authorizationRef:'policy:test',
  }),/youtube_media_digest_mismatch/);
  assert.equal(called,false);
});
