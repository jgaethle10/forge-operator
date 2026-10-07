import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ProviderCredentialVault} from '../evercraft-home/credential-vault.mjs';
import {
  resolveStripeSettlementSecret,
  stripeSettlementSecretStatus,
} from './stripe-secret-boundary.mjs';

test('Stripe settlement secret resolves from Raven runtime binding without echo',()=>{
  const secret=resolveStripeSettlementSecret({
    RAVEN_STRIPE_SECRET_KEY:'sk_live_fixture_runtime_abcdefghijklmnopqrstuvwxyz',
  });
  assert.equal(secret.source,'runtime_binding');
  const status=stripeSettlementSecretStatus(secret);
  assert.equal(status.configured,true);
  assert.equal(status.secret_boundary,'raven_nexus');
  assert.equal(JSON.stringify(status).includes('sk_live_fixture'),false);
});

test('Stripe settlement secret falls back to owned encrypted provider vault',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'stripe-vault-'));
  try{
    const vault=new ProviderCredentialVault({stateDir:dir});
    const meta=vault.put({
      provider:'stripe',
      environment:'live',
      label:'evercraft-payments',
      apiKeyId:'stripe-secret-key',
      apiSecret:'sk_live_fixture_vault_abcdefghijklmnopqrstuvwxyz',
      actorRef:'test',
    });
    const secret=resolveStripeSettlementSecret({EVERCRAFT_CREDENTIAL_STATE_DIR:dir});
    assert.equal(secret.source,'owned_vault');
    assert.equal(secret.credential_ref,meta.credential_ref);
    assert.equal(secret.secret_key,'sk_live_fixture_vault_abcdefghijklmnopqrstuvwxyz');
    const status=stripeSettlementSecretStatus(secret);
    assert.equal(status.configured,true);
    assert.equal(status.secret_values_exposed,false);
    assert.equal(JSON.stringify(status).includes('sk_live_fixture_vault'),false);
  }finally{
    fs.rmSync(dir,{recursive:true,force:true});
  }
});

test('missing Stripe settlement credential fails closed',()=>{
  assert.equal(resolveStripeSettlementSecret({}),null);
  assert.equal(stripeSettlementSecretStatus(null).configured,false);
});
