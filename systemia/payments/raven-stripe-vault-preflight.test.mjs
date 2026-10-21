import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {inspectStripeVaultMetadata} from '../../scripts/systemia-stripe-vault-preflight.mjs';

const root=()=>fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-raven-stripe-audit-'));
const init=dir=>{
  fs.chmodSync(dir,0o700);
  fs.writeFileSync(path.join(dir,'.vault-key'),Buffer.alloc(32,7),{mode:0o600});
};
const stripeRecord=(patch={})=>({
  schema:'evercraft.provider-credential-envelope.v1',
  credential_ref:'provider_stripe_live_0123456789abcdef',
  provider:'stripe',environment:'live',status:'active',
  secret_material_stored:true,plaintext_persisted:false,
  encryption:{algorithm:'aes-256-gcm',ciphertext:'ENCRYPTED_TEST_ONLY'},
  ...patch,
});
const write=(dir,value)=>{
  fs.writeFileSync(path.join(dir,'stripe.json'),JSON.stringify(value),{mode:0o600});
};

test('preflight missing vault never creates directories, key or credentials',()=>{
  const dir=path.join(os.tmpdir(),'evercraft-stripe-nonexistent-'+process.pid);
  fs.rmSync(dir,{recursive:true,force:true});
  const result=inspectStripeVaultMetadata({stateDir:dir});
  assert.equal(result.vault_state,'not_found_no_changes');
  assert.equal(result.sealed_live_stripe_records,0);
  assert.equal(fs.existsSync(dir),false);
});

test('private encrypted stripe record is discovered without reading secret material',()=>{
  const dir=root();
  try{
    init(dir);
    const original=stripeRecord();
    write(dir,original);
    const previous=fs.readFileSync(path.join(dir,'stripe.json'),'utf8');
    const mtime=fs.statSync(path.join(dir,'stripe.json')).mtimeMs;
    const result=inspectStripeVaultMetadata({stateDir:dir});
    assert.equal(result.vault_state,'sealed_live_stripe_metadata_found_not_authenticated');
    assert.equal(result.sealed_live_stripe_records,1);
    assert.equal(result.account_match_verified,false);
    assert.equal(result.stripe_api_authorized,false);
    assert.equal(result.payment_verified,false);
    assert.equal(result.inspection_read_only,true);
    assert.equal(JSON.stringify(result).includes(original.credential_ref),false);
    assert.equal(JSON.stringify(result).includes('ENCRYPTED_TEST_ONLY'),false);
    assert.equal(fs.readFileSync(path.join(dir,'stripe.json'),'utf8'),previous);
    assert.equal(fs.statSync(path.join(dir,'stripe.json')).mtimeMs,mtime);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('vault permissions, absent key, fake claims and symlink files fail closed',()=>{
  const dir=root();
  try{
    init(dir);
    write(dir,stripeRecord({plaintext_persisted:true}));
    assert.equal(inspectStripeVaultMetadata({stateDir:dir}).vault_state,'held_untrusted_vault_records');
    write(dir,stripeRecord());
    fs.chmodSync(dir,0o755);
    assert.equal(inspectStripeVaultMetadata({stateDir:dir}).vault_state,'held_insecure_directory');
    fs.chmodSync(dir,0o700);
    fs.chmodSync(path.join(dir,'.vault-key'),0o644);
    assert.equal(inspectStripeVaultMetadata({stateDir:dir}).vault_state,'held_invalid_vault_key_permissions_or_size');
    fs.chmodSync(path.join(dir,'.vault-key'),0o600);
    fs.rmSync(path.join(dir,'stripe.json'));
    fs.symlinkSync(path.join(dir,'.vault-key'),path.join(dir,'stripe.json'));
    assert.equal(inspectStripeVaultMetadata({stateDir:dir}).vault_state,'held_untrusted_vault_records');
    fs.rmSync(path.join(dir,'stripe.json'));
    assert.equal(inspectStripeVaultMetadata({stateDir:dir}).vault_state,'existing_private_vault_no_stripe_record');
    fs.rmSync(path.join(dir,'.vault-key'));
    assert.equal(inspectStripeVaultMetadata({stateDir:dir}).vault_state,'uninitialized_no_changes');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('sandbox/test records are not promoted to live Stripe account authority',()=>{
  const dir=root();
  try{
    init(dir);
    write(dir,stripeRecord({environment:'sandbox'}));
    const info=inspectStripeVaultMetadata({stateDir:dir});
    assert.equal(info.vault_state,'existing_private_vault_no_stripe_record');
    assert.equal(info.sealed_live_stripe_records,0);
    assert.equal(info.stripe_api_authorized,false);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
