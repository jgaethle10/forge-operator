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
