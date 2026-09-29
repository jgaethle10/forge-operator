import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { EvercraftIdentity } from "./identity.mjs";
import { EvercraftPassport } from "../passport/passport.mjs";

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,"..","..");
const state=fs.mkdtempSync(path.join(os.tmpdir(),"evercraft-owner-bootstrap-"));
const identityStateDir=path.join(state,"identity");
const passportStateDir=path.join(state,"passport");
const passwordFile=path.join(state,"owner-password");
fs.writeFileSync(passwordFile,"proof owner password long enough 2026\n",{mode:0o600});

try{
  const run=spawnSync(process.execPath,[path.join(root,"systemia","identity","bootstrap-owner.mjs")],{
    cwd:root,
    env:{
      ...process.env,
      EVERCRAFT_IDENTITY_STATE_DIR:identityStateDir,
      EVERCRAFT_PASSPORT_STATE_DIR:passportStateDir,
      EVERCRAFT_OWNER_PASSWORD_FILE:passwordFile,
      EVERCRAFT_OWNER_BOOTSTRAP_AUTHORITY_RECEIPT:"manual:ci-owner-bootstrap",
      EVERCRAFT_OWNER_SUBJECT_REF:"user:owner-ci",
      EVERCRAFT_OWNER_LOGIN:"owner-ci",
      EVERCRAFT_OWNER_DISPLAY_NAME:"Owner CI",
    },
    encoding:"utf8",
  });
  assert.equal(run.status,0,run.stderr);
  const output=JSON.parse(run.stdout);
  assert.equal(output.ok,true);
  assert.equal(output.subject_ref,"user:owner-ci");
  assert.match(output.identity_receipt,/^sha256:[a-f0-9]{64}$/);

  const identity=new EvercraftIdentity({stateDir:identityStateDir});
  const auth=identity.authenticatePassword({
    login:"owner-ci",
    password:"proof owner password long enough 2026",
  });
  assert.equal(auth.subject_ref,"user:owner-ci");

  const passport=new EvercraftPassport({stateDir:passportStateDir});
  for(const scope of ["home.read","home.systemia.read","home.systemia.plan","home.yard.read","home.network.read", "home.identity.sessions.manage"]){
    const decision=passport.authorize({
      subject_ref:"user:owner-ci",
      product:"evercraft-home",
      scope,
      at:new Date().toISOString(),
    });
    assert.equal(decision.decision,"allow",scope);
  }

  const second=spawnSync(process.execPath,[path.join(root,"systemia","identity","bootstrap-owner.mjs")],{
    cwd:root,
    env:{
      ...process.env,
      EVERCRAFT_IDENTITY_STATE_DIR:identityStateDir,
      EVERCRAFT_PASSPORT_STATE_DIR:passportStateDir,
      EVERCRAFT_OWNER_PASSWORD_FILE:passwordFile,
      EVERCRAFT_OWNER_BOOTSTRAP_AUTHORITY_RECEIPT:"manual:ci-owner-bootstrap-repeat",
      EVERCRAFT_OWNER_SUBJECT_REF:"user:owner-ci-2",
      EVERCRAFT_OWNER_LOGIN:"owner-ci-2",
      EVERCRAFT_OWNER_DISPLAY_NAME:"Owner CI 2",
    },
    encoding:"utf8",
  });
  assert.notEqual(second.status,0);
  assert.match(second.stderr,/identity_bootstrap_already_completed/);

  console.log(JSON.stringify({
    ok:true,
    schema:"evercraft.identity.owner-bootstrap-proof.v1",
    identity_authenticated:true,
    passport_home_scopes_verified:true,
    repeated_bootstrap_rejected:true,
  },null,2));
}finally{
  fs.rmSync(state,{recursive:true,force:true});
}
