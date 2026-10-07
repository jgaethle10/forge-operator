import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ProviderCredentialVault } from "../evercraft-home/credential-vault.mjs";
import {
  qlooCompetitionSecretStatus,
  resolveQlooCompetitionSecret,
} from "./qloo-secret-boundary.mjs";

test("Qloo runtime binding wins without echoing the key in status",()=>{
  const secret=resolveQlooCompetitionSecret({
    RAVEN_QLOO_API_KEY:"runtime-qloo-key-abcdefghijklmnopqrstuvwxyz",
  });
  assert.equal(secret.source,"runtime_binding");
  assert.equal(secret.api_key,"runtime-qloo-key-abcdefghijklmnopqrstuvwxyz");
  const status=qlooCompetitionSecretStatus(secret);
  assert.equal(status.qloo_configured,true);
  assert.equal(status.source,"runtime_binding");
  assert.equal(JSON.stringify(status).includes("runtime-qloo-key"),false);
});

test("Qloo falls back to Raven owned credential vault",()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"qloo-vault-"));
  try{
    const vault=new ProviderCredentialVault({stateDir:dir});
    const metadata=vault.put({
      provider:"qloo",
      environment:"live",
      label:"competition-commonground",
      apiKeyId:"qloo-api-key",
      apiSecret:"vault-qloo-secret-abcdefghijklmnopqrstuvwxyz",
      actorRef:"test",
    });
    const secret=resolveQlooCompetitionSecret({
      RAVEN_PROVIDER_CREDENTIAL_STATE_DIR:dir,
    });
    assert.equal(secret.source,"owned_vault");
    assert.equal(secret.credential_ref,metadata.credential_ref);
    assert.equal(secret.api_key,"vault-qloo-secret-abcdefghijklmnopqrstuvwxyz");
    const status=qlooCompetitionSecretStatus(secret);
    assert.equal(status.qloo_configured,true);
    assert.equal(JSON.stringify(status).includes("vault-qloo-secret"),false);
  }finally{
    fs.rmSync(dir,{recursive:true,force:true});
  }
});

test("missing Qloo credential fails closed",()=>{
  const secret=resolveQlooCompetitionSecret({});
  assert.equal(secret,null);
  const status=qlooCompetitionSecretStatus(secret);
  assert.equal(status.qloo_configured,false);
  assert.equal(status.secret_values_exposed,false);
});
