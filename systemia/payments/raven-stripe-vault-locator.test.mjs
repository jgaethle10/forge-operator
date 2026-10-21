import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  boundedStripeVaultCandidates,inspectBoundedStripeVaults,
} from '../../scripts/systemia-stripe-vault-locator.mjs';

test('locates alternate private resident binding without publishing path or reading credentials',()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'stripe-vault-bounded-'));
  try{
    const privateEnvFile=path.join(tmp,'local-organism.env');
    const alt=path.join(tmp,'pre-existing-vault');
    fs.writeFileSync(privateEnvFile,'RAVEN_PROVIDER_CREDENTIAL_STATE_DIR='+alt+'\nSOME_SECRET=must-not-echo\n',{mode:0o600});
    const candidates=boundedStripeVaultCandidates({
      home:tmp,env:{},privateEnvFile,
    });
    assert.ok(candidates.some(c=>c.label==='local_organism_private_configuration'&&c.dir===alt));
    const result=inspectBoundedStripeVaults({
      candidates,
      inspector:({stateDir})=>stateDir===alt
        ? {vault_state:'sealed_live_stripe_metadata_found_not_authenticated',sealed_live_stripe_records:1}
        : {vault_state:'not_found_no_changes',sealed_live_stripe_records:0},
    });
    assert.equal(result.any_sealed_stripe_record_found,true);
    assert.equal(result.next_gate,'authorize_existing_vault_account_revalidation');
    assert.equal(result.runtime_authorized,false);
    assert.equal(result.credential_material_accessed,false);
    assert.equal(result.vault_or_account_modified,false);
    const json=JSON.stringify(result);
    assert.equal(json.includes(tmp),false);
    assert.equal(json.includes('must-not-echo'),false);
    assert.equal(json.includes('credential_ref'),false);
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});

test('unsafe or foreign-readable user env files are not trusted as credential vault bindings',()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'stripe-vault-env-'));
  try{
    const privateEnvFile=path.join(tmp,'organism.env');
    const value=path.join(tmp,'vault-location');
    fs.writeFileSync(privateEnvFile,'RAVEN_PROVIDER_CREDENTIAL_STATE_DIR='+value+'\n',{mode:0o644});
    const candidates=boundedStripeVaultCandidates({home:tmp,env:{},privateEnvFile});
    assert.equal(candidates.some(c=>c.label==='local_organism_private_configuration'),false);
    fs.chmodSync(privateEnvFile,0o600);
    const second=boundedStripeVaultCandidates({home:tmp,env:{},privateEnvFile});
    assert.equal(second.some(c=>c.label==='local_organism_private_configuration'),true);
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});

test('unknown vault paths or denied access never imply absent Stripe credentials globally',()=>{
  const candidates=[
    {label:'vault_a',dir:'/existing/a'},
    {label:'vault_b',dir:'/existing/b'},
  ];
  const result=inspectBoundedStripeVaults({
    candidates,
    inspector:({stateDir})=>stateDir==='/existing/a'
      ? {vault_state:'not_found_no_changes',sealed_live_stripe_records:0}
      : {vault_state:'unreadable_no_changes',sealed_live_stripe_records:0},
  });
  assert.equal(result.any_sealed_stripe_record_found,false);
  assert.equal(result.some_locations_unreadable_or_held,true);
  assert.equal(result.candidate_scan_complete,false);
  assert.equal(result.next_gate,'review_bound_or_inaccessible_vault_location_without_reconnect');
  assert.equal(result.checkout_verified,false);
  assert.equal(JSON.stringify(result).includes('/existing/'),false);
});

test('bounded scan with no known records recommends permissioned intake but never creates one',()=>{
  const dir=path.join(os.tmpdir(),'evercraft-vault-definitely-missing-'+process.pid);
  fs.rmSync(dir,{recursive:true,force:true});
  const result=inspectBoundedStripeVaults({candidates:[{label:'default',dir}]});
  assert.equal(result.any_sealed_stripe_record_found,false);
  assert.equal(result.next_gate,'operator_authorize_credential_intake_only_if_needed');
  assert.equal(result.candidates[0].vault_state,'not_found_no_changes');
  assert.equal(fs.existsSync(dir),false);
});
