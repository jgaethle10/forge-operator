import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ProviderCredentialVault } from './credential-vault.mjs';
import { startEvercraftHomeServer } from './server.mjs';

test('Evercraft Home seals Facebook Page credentials without echoing token material',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-home-facebook-credential-'));
  const runtime=await startEvercraftHomeServer({
    host:'127.0.0.1',
    port:0,
    authMode:'local',
    credentialStateDir:root,
  });

  try{
    const fakeToken='test-page-token-'+('y'.repeat(40));
    const response=await fetch(runtime.url+'/api/credentials/providers/facebook-pages',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        page_id:'123456789012345',
        page_access_token:fakeToken,
      }),
    });
    assert.equal(response.status,201);
    const body=await response.json();
    assert.equal(body.ok,true);
    assert.equal(body.provider,'facebook-pages');
    assert.equal(body.secret_material_returned,false);
    assert.equal(JSON.stringify(body).includes(fakeToken),false);

    const status=await fetch(runtime.url+'/api/credentials/providers/facebook-pages/status');
    assert.equal(status.status,200);
    const statusBody=await status.json();
    assert.equal(statusBody.credentials.length,1);
    assert.equal(statusBody.secret_material_returned,false);

    const vault=new ProviderCredentialVault({stateDir:root});
    const plain=vault.readSecret(body.credential.credential_ref);
    assert.equal(plain.api_key_id,'123456789012345');
    assert.equal(plain.api_secret,fakeToken);

    const persisted=fs.readdirSync(root)
      .filter(name=>name.endsWith('.json'))
      .map(name=>fs.readFileSync(path.join(root,name),'utf8'))
      .join('\n');
    assert.equal(persisted.includes(fakeToken),false);
  }finally{
    await runtime.close();
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('private Clip diagnostic verifies Page GETs without publishing or exposing a token',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-home-clip-diagnostic-'));
  const secret='extremely-sensitive-test-page-token-'+('y'.repeat(48));
  const pageId='1253915241138545';
  const vault=new ProviderCredentialVault({stateDir:root});
  const record=vault.put({provider:'facebook-pages',environment:'live',label:'evercraft-clip',
    apiKeyId:pageId,apiSecret:secret,actorRef:'test'});
  const calls=[];
  const runtime=await startEvercraftHomeServer({
    host:'127.0.0.1',port:0,authMode:'local',credentialStateDir:root,
    clipFacebookFetch:async(url,init)=>{
      calls.push({url,init});
      assert.equal(init.method,'GET');
      assert.equal(init.headers.Authorization,'Bearer '+secret);
      if(url.includes('/published_posts'))return {
        status:200,async json(){return {data:[]};}
      };
      return {status:200,async json(){return {id:pageId,name:'Evercraft'};}};
    }
  });
  try{
    const response=await fetch(runtime.url+'/api/clip/facebook/diagnose',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({credential_ref:record.credential_ref})
    });
    assert.equal(response.status,200);
    const body=await response.json();
    assert.equal(body.ok,true);
    assert.equal(body.diagnostic.state,'read_only_verified_write_unverified');
    assert.equal(body.diagnostic.page_identity_verified,true);
    assert.equal(body.diagnostic.page_content_read_verified,true);
    assert.equal(body.diagnostic.publish_permission_verified,false);
    assert.equal(body.diagnostic.publish_performed,false);
    assert.equal(body.diagnostic.provider_mutation_attempted,false);
    assert.equal(calls.length,2);
    assert.equal(JSON.stringify(body).includes(secret),false);
  }finally{await runtime.close();fs.rmSync(root,{recursive:true,force:true});}
});
test('Clip connection diagnostics fail closed without a sealed credential vault',async()=>{
  const runtime=await startEvercraftHomeServer({
    host:'127.0.0.1',port:0,authMode:'local',credentialStateDir:''
  });
  try{
    const response=await fetch(runtime.url+'/api/clip/facebook/diagnose',{
      method:'POST',headers:{'content-type':'application/json'},body:'{}'
    });
    assert.equal(response.status,503);
    const body=await response.json();
    assert.equal(body.state,'credential_vault_not_configured');
    assert.equal(body.provider_mutation_attempted,false);
  }finally{await runtime.close();}
});
test('Clip diagnostic rejects malformed selection before contacting the provider',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-home-clip-invalid-'));
  let providerCalls=0;
  const runtime=await startEvercraftHomeServer({
    host:'127.0.0.1',port:0,authMode:'local',credentialStateDir:root,
    clipFacebookFetch:async()=>{providerCalls++;throw Error('must_not_call_provider');}
  });
  try{
    const response=await fetch(runtime.url+'/api/clip/facebook/diagnose',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({credential_ref:{unexpected:'object'}})
    });
    assert.equal(response.status,400);
    const body=await response.json();
    assert.equal(body.state,'clip_diagnostic_selection_invalid');
    assert.equal(providerCalls,0);
  }finally{await runtime.close();fs.rmSync(root,{recursive:true,force:true});}
});
