import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ProviderCredentialVault } from "../evercraft-home/credential-vault.mjs";
import {
  payPalCompetitionSecretStatus,
  resolvePayPalCompetitionSecret,
} from "./paypal-secret-boundary.mjs";

test("PayPal runtime binding is accepted without secret echo",()=>{
  const secret=resolvePayPalCompetitionSecret({
    PAYPAL_CLIENT_ID:"paypal-client-fixture",
    PAYPAL_CLIENT_SECRET:"paypal-secret-fixture-abcdefghijklmnopqrstuvwxyz",
  });
  assert.equal(secret.source,"runtime_binding");
  const status=payPalCompetitionSecretStatus(secret);
  assert.equal(status.paypal_configured,true);
  assert.equal(JSON.stringify(status).includes("paypal-secret-fixture"),false);
});

test("PayPal sandbox credentials fall back to Raven owned vault",()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"paypal-vault-"));
  try{
    const vault=new ProviderCredentialVault({stateDir:dir});
    const meta=vault.put({
      provider:"paypal",
      environment:"sandbox",
      label:"competition-checkout-black-box",
      apiKeyId:"paypal-client-fixture-123456",
      apiSecret:"paypal-secret-fixture-abcdefghijklmnopqrstuvwxyz",
      actorRef:"test",
    });
    const secret=resolvePayPalCompetitionSecret({RAVEN_PROVIDER_CREDENTIAL_STATE_DIR:dir});
    assert.equal(secret.source,"owned_vault");
    assert.equal(secret.credential_ref,meta.credential_ref);
    assert.equal(secret.client_id,"paypal-client-fixture-123456");
    assert.equal(secret.client_secret,"paypal-secret-fixture-abcdefghijklmnopqrstuvwxyz");
    const status=payPalCompetitionSecretStatus(secret);
    assert.equal(status.paypal_configured,true);
    assert.equal(JSON.stringify(status).includes("paypal-secret-fixture"),false);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test("missing PayPal credential fails closed",()=>{
  const secret=resolvePayPalCompetitionSecret({});
  assert.equal(secret,null);
  const status=payPalCompetitionSecretStatus(secret);
  assert.equal(status.paypal_configured,false);
  assert.equal(status.secret_values_exposed,false);
});
