import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ravenInferenceCredentialStatus,
  sealRavenInferenceCredential,
} from "./seal-inference-key.mjs";

test("local inference credential helper seals Gemini without returning secret", () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"raven-local-seal-"));
  const secret="AIzaSyLocalProofSecret123456789012345678";
  try{
    assert.equal(ravenInferenceCredentialStatus({provider:"gemini",stateDir:root}).configured,false);
    const result=sealRavenInferenceCredential({
      provider:"gemini",
      stateDir:root,
      apiKey:secret,
      actorRef:"proof",
    });
    assert.equal(result.ok,true);
    assert.equal(result.provider,"gemini");
    assert.equal(result.secret_material_returned,false);
    assert.equal(result.plaintext_persisted,false);
    assert.equal(JSON.stringify(result).includes(secret),false);
    const status=ravenInferenceCredentialStatus({provider:"gemini",stateDir:root});
    assert.equal(status.configured,true);
    assert.equal(status.credential_count,1);
    const persisted=fs.readdirSync(root,{recursive:true})
      .filter((name)=>typeof name==="string")
      .map((name)=>{
        const file=path.join(root,name);
        return fs.existsSync(file)&&fs.statSync(file).isFile()?fs.readFileSync(file,"utf8"):"";
      }).join("\n");
    assert.equal(persisted.includes(secret),false);
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test("local inference credential helper refuses unsupported provider", () => {
  assert.throws(()=>ravenInferenceCredentialStatus({
    provider:"ollama",
    stateDir:"/tmp/unused",
  }),/hosted_raven_provider/);
});
