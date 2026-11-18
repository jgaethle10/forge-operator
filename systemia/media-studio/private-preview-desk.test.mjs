import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {makeTimelineProject,replaceTimelineClipAsset} from './timeline.js';
import {saveTimelineVersion} from './timeline-version-vault.mjs';
import {PREVIEW_DESK_SCHEMA,PREVIEW_NOTE_SCHEMA,
  preparePreviewDesk,startPreviewDesk} from './private-preview-desk.mjs';

const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const scoped='private:studio-operator-source-review-001';
function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-preview-desk-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const vaultRoot=path.join(root,'vault'),mediaRoot=path.join(root,'media'),notesRoot=path.join(root,'notes');
  for(const dir of [vaultRoot,mediaRoot])fs.mkdirSync(dir,{mode:0o700});
  const asset=(id)=>({id,path:'/private/'+id+'.mp4',digest:sha(id),kind:'video',
    sourceRefs:['private:footage-licensing-'+id]});
  const project=makeTimelineProject({
    id:'private-roofing-film',title:'Roofing firm test',aspectRatio:'9:16',
    assets:[asset('opening'),asset('old-ending'),asset('revised-ending')],
    tracks:[{id:'picture',name:'Picture',kind:'video',clips:[
      {id:'opening',trackId:'picture',assetId:'opening',startSec:0,durationSec:10,locked:true},
      {id:'ending',trackId:'picture',assetId:'old-ending',startSec:10,durationSec:20}
    ]}]
  });
  const first=saveTimelineVersion({root:vaultRoot,project,operatorScopeReference:scoped});
  const secondProject=replaceTimelineClipAsset({project,clipId:'ending',
    newAsset:project.assets[2],expectedVersion:1}).project;
  const second=saveTimelineVersion({root:vaultRoot,project:secondProject,
    expectedHeadDigest:first.projectDigest,operatorScopeReference:scoped});
  function mp4(label){
    const bytes=Buffer.concat([Buffer.from([0,0,0,16]),Buffer.from('ftypisom'),
      Buffer.from('not-a-playable-real-clip-'+label)]);
    const name=label+'.mp4';
    fs.writeFileSync(path.join(mediaRoot,name),bytes);
    return {name,sha:sha(bytes),bytes};
  }
  const old=mp4('review-old'),newVideo=mp4('review-new');
  const previews=[
    {projectDigest:first.projectDigest,relativeMediaPath:old.name,
      mediaSha256:old.sha,privateReviewAuthorized:true,
      reviewAuthorityReference:'private:visual-review-release-0001',
      label:'First private cut'},
    {projectDigest:second.projectDigest,relativeMediaPath:newVideo.name,
      mediaSha256:newVideo.sha,privateReviewAuthorized:true,
      reviewAuthorityReference:'private:visual-review-release-0002',
      label:'Updated ending'}
  ];
  const manifest={schema:PREVIEW_DESK_SCHEMA,projectId:project.id,previews};
  return {root,vaultRoot,mediaRoot,notesRoot,manifest,old,newVideo,first,second};
}
test('only versioned, SHA-verified, operator-attested files enter private review',t=>{
  const f=fixture(t);
  const ready=preparePreviewDesk(f);
  assert.equal(ready.previews.length,2);
  assert.equal(ready.previews[1].version,2);
  assert.equal(ready.boundaries.loopbackOnly,true);
  assert.equal(ready.boundaries.generatedMedia,false);
  assert.equal(ready.boundaries.publicationAuthority,false);
  assert.equal(fs.statSync(f.notesRoot).mode&0o777,0o700);
  assert.throws(()=>preparePreviewDesk({...f,
    manifest:{...f.manifest,previews:[{...f.manifest.previews[0],privateReviewAuthorized:false} ]}}),
    /version_not_authorized/);
  assert.throws(()=>preparePreviewDesk({...f,
    manifest:{...f.manifest,previews:[{...f.manifest.previews[0],mediaSha256:'0'.repeat(64)}]}}),
    /digest_mismatch/);
});
test('path traversal, symlinks, duplicate versions and unverified rights fail closed',t=>{
  const f=fixture(t);
  const first=f.manifest.previews[0];
  for(const relative of ['../outside.mp4','/etc/shadow']){
    assert.throws(()=>preparePreviewDesk({...f,manifest:{...f.manifest,
      previews:[{...first,relativeMediaPath:relative}]}}),/outside_private_root|path_invalid/);
  }
  fs.symlinkSync(path.join(f.mediaRoot,f.old.name),path.join(f.mediaRoot,'bad-link.mp4'));
  assert.throws(()=>preparePreviewDesk({...f,manifest:{...f.manifest,
    previews:[{...first,relativeMediaPath:'bad-link.mp4'}]}}),/symlink_rejected/);
  assert.throws(()=>preparePreviewDesk({...f,manifest:{...f.manifest,
    previews:[first,first]}}),/version_not_authorized/);
  assert.throws(()=>preparePreviewDesk({...f,manifest:{...f.manifest,
    previews:[{...first,reviewAuthorityReference:''}]}}),/version_not_authorized/);
});
test('private loopback room serves existing MP4 bytes and exact version selection without uploading',async t=>{
  const f=fixture(t);
  const desk=await startPreviewDesk(f);t.after(()=>desk.close());
  assert.match(desk.url,/^http:\/\/127\.0\.0\.1:\d+\/session\/[0-9a-f]{48}$/);
  const response=await fetch(desk.url);
  assert.equal(response.status,200);
  assert.match(response.headers.get('content-security-policy'),/default-src 'none'/);
  assert.equal(response.headers.get('referrer-policy'),'no-referrer');
  const html=await response.text();
  assert.match(html,/Watch it\. Shape it\./);
  assert.match(html,/id="preview"/);
  assert.doesNotMatch(html,/https?:\/\/|<form[^>]+action=/i);
  const versions=await(await fetch(desk.url+'/versions')).json();
  assert.equal(versions.previews.length,2);
  assert.equal(versions.previews[0].projectDigest,f.first.projectDigest);
  assert.equal(versions.previews[1].projectDigest,f.second.projectDigest);
  assert.equal(JSON.stringify(versions).includes(f.old.name),false,'raw local media path stays private');
  const media=await fetch(desk.url+'/media/1',{headers:{range:'bytes=0-11'}});
  assert.equal(media.status,206);
  assert.equal(media.headers.get('content-type'),'video/mp4');
  assert.equal(media.headers.get('content-range'),'bytes 0-11/'+f.newVideo.bytes.length);
  assert.deepEqual(Buffer.from(await media.arrayBuffer()),f.newVideo.bytes.subarray(0,12));
  const suffix=await fetch(desk.url+'/media/0',{headers:{range:'bytes=-5'}});
  assert.equal(suffix.status,206);
  assert.deepEqual(Buffer.from(await suffix.arrayBuffer()),f.old.bytes.subarray(-5));
  const inaccessible=await fetch(desk.url.replace(/\/session\/[a-f0-9]+$/,'')+'/versions');
  assert.equal(inaccessible.status,404);
  const invalid=await fetch(desk.url+'/media/0',{headers:{range:'bytes=9999-'}});
  assert.equal(invalid.status,416);
  const script=await(await fetch(desk.url+'/private-preview.js')).text();
  assert.match(script,/Save revision request|PRIVATE_NOTE_RECORDED/);
});
test('operator clicks save: private note bound to selected version, no Saban or publication',async t=>{
  const f=fixture(t);
  const desk=await startPreviewDesk(f);t.after(()=>desk.close());
  const origin=new URL(desk.url).origin;
  const send=(body,headers={})=>fetch(desk.url+'/notes',{method:'POST',
    headers:{origin,'content-type':'application/json','x-fallen-review':'local-action',...headers},
    body:JSON.stringify(body)});
  const note='Keep the opening exactly. Make the ending feel more exciting.';
  const accepted=await send({index:1,expectedProjectDigest:f.second.projectDigest,note});
  assert.equal(accepted.status,201);
  assert.equal((await accepted.json()).status,'PRIVATE_NOTE_RECORDED');
  const records=fs.readdirSync(f.notesRoot);
  assert.equal(records.length,1);
  const file=path.join(f.notesRoot,records[0]);
  const record=JSON.parse(fs.readFileSync(file,'utf8'));
  assert.equal(record.schema,PREVIEW_NOTE_SCHEMA);
  assert.equal(record.projectDigest,f.second.projectDigest);
  assert.equal(record.mediaSha256,f.newVideo.sha);
  assert.equal(record.note,note);
  assert.equal(record.sabanExecution,false);
  assert.equal(record.videoEdited,false);
  assert.equal(record.published,false);
  assert.equal(fs.statSync(file).mode&0o777,0o600);
  assert.equal((await send({index:1,expectedProjectDigest:f.first.projectDigest,note})).status,400);
  assert.equal((await send({index:1,expectedProjectDigest:f.second.projectDigest,note},
    {origin:'https://attacker.invalid'})).status,403);
  assert.equal((await send({index:1,expectedProjectDigest:f.second.projectDigest,note},
    {'x-fallen-review':'no'})).status,403);
  assert.equal((await send({index:1,expectedProjectDigest:f.second.projectDigest,
    note:'too brief'})).status,400);
  assert.equal(fs.readdirSync(f.notesRoot).length,1,'rejected changes must never write notes');
});
test('media tampering after desk starts is blocked on subsequent playback requests',async t=>{
  const f=fixture(t);
  const desk=await startPreviewDesk(f);t.after(()=>desk.close());
  fs.appendFileSync(path.join(f.mediaRoot,f.old.name),'tampered');
  const response=await fetch(desk.url+'/media/0');
  assert.equal(response.status,416);
});
