import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ProviderCredentialVault } from '../evercraft-home/credential-vault.mjs';
import { resolveFacebookPageCredential } from './facebook-page-credential-resolver.mjs';

test('Clip resolves Facebook Page credentials by reference from the owned vault',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'clip-fb-credential-'));
  try{
    const fakeToken='test-page-token-'+('x'.repeat(40));
    const vault=new ProviderCredentialVault({stateDir:root});
    const stored=vault.put({
      provider:'facebook-pages',
      environment:'live',
      label:'evercraft-clip',
      apiKeyId:'123456789012345',
      apiSecret:fakeToken,
      actorRef:'test',
    });

    const resolved=resolveFacebookPageCredential({
      credentialStateDir:root,
      env:{CLIP_FACEBOOK_CREDENTIAL_REF:stored.credential_ref},
    });

    assert.equal(resolved.config.pageId,'123456789012345');
    assert.equal(resolved.config.pageAccessToken,fakeToken);
    assert.equal(resolved.safe_status.facebook,'resolved');
    assert.equal(resolved.safe_status.secret_material_returned,false);
    assert.equal(JSON.stringify(resolved.safe_status).includes(fakeToken),false);
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('missing credential reference fails closed without returning a token',()=>{
  const resolved=resolveFacebookPageCredential({
    credentialStateDir:'/tmp/unused',
    env:{},
  });
  assert.deepEqual(resolved.config,{});
  assert.equal(resolved.safe_status.facebook,'credential_ref_missing');
  assert.equal(resolved.safe_status.secret_material_returned,false);
});
