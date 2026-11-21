import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {googleDriveAdapter} from '../scripts/artifact-google-drive.mjs';
import {preserveArtifact} from '../scripts/artifact-preservation.mjs';
import {main as explicitEntry} from '../scripts/artifact-preserve-drive.mjs';

const TOKEN='offline-test-not-a-real-token';
const FOLDER='fakeApprovedFolderForOfflineTests123';
const sourceFixture=()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ec-google-drive-'));
  const source=path.join(root,'model.zip');
  fs.writeFileSync(source,Buffer.from('Evercraft temporary research data'));
  return {root,source,custodyDir:path.join(root,'receipts')};
};
const clean=(x)=>fs.rmSync(x.root,{recursive:true,force:true});
const fixtureKey='quantum-foundry/v0.4/'+ 'a'.repeat(64);
function googleMock({mutate=false,wrongParent=false,wrongSize=false,sessionUrl=null,failPut=false,failGet=false}={}){
  const calls=[],stored=new Map(); let seq=0;
  const fetchImpl=async (url,init={})=>{
    const u=new URL(url);
    calls.push({url:u.pathname,method:init.method,authorization:init.headers?.Authorization,redirect:init.redirect});
    assert.equal(init.headers.Authorization,`Bearer ${TOKEN}`);
    assert.equal(init.redirect,'error');
    if(u.pathname==='/upload/drive/v3/files' && init.method==='POST'){
      const meta=JSON.parse(init.body);
      assert.deepEqual(meta.parents,[FOLDER]);
      stored.set('name',meta.name);
      return new Response('',{status:200,headers:{Location:sessionUrl||'https://www.googleapis.com/upload/session/test'}});
    }
    if(u.pathname==='/upload/session/test'&&init.method==='PUT'){
      if(failPut)return new Response('',{status:503});
      const bytes=Buffer.from(init.body);
      stored.set('bytes',bytes); seq++;
      return Response.json({id:'testGoogleObject00001',name:stored.get('name')});
    }
    if(u.pathname==='/drive/v3/files/testGoogleObject00001'&&u.searchParams.has('fields')){
      return Response.json({id:'testGoogleObject00001',name:stored.get('name'),parents:[wrongParent?'UnauthorizedFolder001':FOLDER],
        size:String(stored.get('bytes').length+(wrongSize?1:0)),trashed:false,mimeType:'application/octet-stream'});
    }
    if(u.pathname==='/drive/v3/files/testGoogleObject00001'&&u.searchParams.get('alt')==='media'){
      if(failGet)return new Response('',{status:403});
      const data=Buffer.from(stored.get('bytes'));
      if(mutate)data[0]^=1;
      return new Response(data,{status:200});
    }
    throw new Error('unexpected mocked endpoint '+url);
  };
  return {fetchImpl,calls,stored};
}
function adapter(mock){return googleDriveAdapter({accessToken:TOKEN,folderId:FOLDER,fetchImpl:mock.fetchImpl,maxBytes:300000});}

// All tests execute against in-process responses. Nothing goes to Google.
test('provider emulator completes put/metadata/readback in the approved folder',async()=>{
  const f=sourceFixture(),m=googleMock();try{
    const result=await preserveArtifact({source:f.source,project:'quantum-foundry',version:'v0.4',adapter:adapter(m),custodyDir:f.custodyDir});
    assert.equal(result.state,'byte_verified');assert.equal(result.adapter_provider,'google-drive-v3');
    assert.equal(result.backup_roundtrip_attested,false);
    assert.deepEqual(m.calls.map(c=>c.method),['POST','PUT','GET','GET','GET']);
    const event=JSON.parse(fs.readFileSync(path.join(result.receipt_directory,'02-roundtrip.json')));
    assert.equal(event.provider_authentication,'not_independently_attested');
  }finally{clean(f)}
});
test('mismatched downloaded bytes fail closed and create a failure receipt',async()=>{
  const f=sourceFixture(),m=googleMock({mutate:true});try{
    await assert.rejects(()=>preserveArtifact({source:f.source,project:'quantum-foundry',version:'v0.4',adapter:adapter(m),custodyDir:f.custodyDir}),/differ/);
    const run=fs.readdirSync(f.custodyDir)[0];assert.ok(fs.existsSync(path.join(f.custodyDir,run,'09-failure.json')));
  }finally{clean(f)}
});
test('wrong parent folder fails before download',async()=>{
  const f=sourceFixture(),m=googleMock({wrongParent:true});try{
    await assert.rejects(()=>preserveArtifact({source:f.source,project:'quantum-foundry',version:'v0.4',adapter:adapter(m),custodyDir:f.custodyDir}),/outside authorized/);
    assert.equal(m.calls.filter(c=>c.url==='/drive/v3/files/testGoogleObject00001').length,1);
  }finally{clean(f)}
});
test('provider size mismatch fails even when ID is plausible',async()=>{
  const f=sourceFixture(),m=googleMock({wrongSize:true});try{
    await assert.rejects(()=>preserveArtifact({source:f.source,project:'quantum-foundry',version:'v0.4',adapter:adapter(m),custodyDir:f.custodyDir}),/size mismatch/);
  }finally{clean(f)}
});
test('upload errors cannot become verified backup receipts',async()=>{
  const f=sourceFixture(),m=googleMock({failPut:true});try{
    await assert.rejects(()=>preserveArtifact({source:f.source,project:'quantum-foundry',version:'v0.4',adapter:adapter(m),custodyDir:f.custodyDir}),/HTTP 503/);
    const run=fs.readdirSync(f.custodyDir)[0];const events=fs.readdirSync(path.join(f.custodyDir,run));
    assert.ok(events.includes('09-failure.json'));assert.ok(!events.includes('02-roundtrip.json'));
  }finally{clean(f)}
});
test('download permission errors cannot become verified',async()=>{
  const f=sourceFixture(),m=googleMock({failGet:true});try{
    await assert.rejects(()=>preserveArtifact({source:f.source,project:'quantum-foundry',version:'v0.4',adapter:adapter(m),custodyDir:f.custodyDir}),/HTTP 403/);
  }finally{clean(f)}
});
test('malicious resumable session URL is rejected without uploading',async()=>{
  const f=sourceFixture(),m=googleMock({sessionUrl:'https://attacker.example/upload/session/test'});try{
    await assert.rejects(()=>preserveArtifact({source:f.source,project:'quantum-foundry',version:'v0.4',adapter:adapter(m),custodyDir:f.custodyDir}),/untrusted/);
    assert.equal(m.calls.length,1);
  }finally{clean(f)}
});
test('missing token and folder are rejected before any request',()=>{
  assert.throws(()=>googleDriveAdapter({accessToken:'',folderId:FOLDER,fetchImpl:googleMock().fetchImpl}),/token/);
  assert.throws(()=>googleDriveAdapter({accessToken:TOKEN,folderId:'bad',fetchImpl:googleMock().fetchImpl}),/folder/);
});
test('download handles cannot be manufactured by another process',async()=>{
  const f=sourceFixture(),m=googleMock();try{
    await assert.rejects(()=>adapter(m).restore({handle:{provider:'google-drive-v3',object_id:'testGoogleObject00001'},destination:path.join(f.root,'out.bin')}),/session/);
    assert.equal(m.calls.length,0);
  }finally{clean(f)}
});
test('upload size limit stops data before the API is called',async()=>{
  const f=sourceFixture(),m=googleMock();try{
    const tiny=googleDriveAdapter({accessToken:TOKEN,folderId:FOLDER,fetchImpl:m.fetchImpl,maxBytes:1});
    await assert.rejects(()=>preserveArtifact({source:f.source,project:'quantum-foundry',version:'v0.4',adapter:tiny,custodyDir:f.custodyDir}),/size bound/);
    assert.equal(m.calls.length,0);
  }finally{clean(f)}
});

test('private CLI requires an explicit execute gate and supplied OAuth credential',async()=>{
  await assert.rejects(()=>explicitEntry(['--source','/tmp/artifact','--project','quantum-foundry','--version','v0.4','--custody-dir','/tmp/custody'],{}),/execute/);
  await assert.rejects(()=>explicitEntry(['--source','/tmp/artifact','--project','quantum-foundry','--version','v0.4','--custody-dir','/tmp/custody','--execute','authorized-private-upload'],{}),/OAuth/);
});
