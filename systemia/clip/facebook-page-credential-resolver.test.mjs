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

test('Clip auto-resolves the only sealed Facebook Page credential when no ref is supplied',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'clip-fb-single-'));
  try{
    const fakeToken='test-page-token-'+('z'.repeat(40));
    const vault=new ProviderCredentialVault({stateDir:root});
    vault.put({
      provider:'facebook-pages',
      environment:'live',
      label:'evercraft-clip',
      apiKeyId:'987654321098765',
      apiSecret:fakeToken,
      actorRef:'test',
    });
    const resolved=resolveFacebookPageCredential({credentialStateDir:root,env:{}});
    assert.equal(resolved.config.pageId,'987654321098765');
    assert.equal(resolved.config.pageAccessToken,fakeToken);
    assert.equal(resolved.safe_status.facebook,'resolved');
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('Clip refuses to guess when multiple Facebook Page credentials are sealed',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'clip-fb-ambiguous-'));
  try{
    const vault=new ProviderCredentialVault({stateDir:root});
    vault.put({provider:'facebook-pages',environment:'live',label:'one',apiKeyId:'111111111111111',apiSecret:'test-token-'+('a'.repeat(40)),actorRef:'test'});
    vault.put({provider:'facebook-pages',environment:'live',label:'two',apiKeyId:'222222222222222',apiSecret:'test-token-'+('b'.repeat(40)),actorRef:'test'});
    const resolved=resolveFacebookPageCredential({credentialStateDir:root,env:{}});
    assert.deepEqual(resolved.config,{});
    assert.equal(resolved.safe_status.facebook,'credential_selection_ambiguous');
    assert.equal(resolved.safe_status.candidate_count,2);
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});
