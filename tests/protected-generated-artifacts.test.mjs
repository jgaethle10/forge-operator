import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  enforceProtectedGeneratedArtifacts,
  gitBlobSha
} from '../scripts/enforce-protected-generated-artifacts.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'protected-generated-artifacts-'));
try{
  const governance=path.join(root,'governance');
  const publicDir=path.join(root,'public');
  fs.mkdirSync(governance,{recursive:true});
  fs.mkdirSync(publicDir,{recursive:true});

  const approved=Buffer.from('{"approved":true,"value":"partner-locked"}\n');
  fs.writeFileSync(path.join(governance,'approved.json'),approved);
  fs.writeFileSync(path.join(publicDir,'generated.json'),'{"approved":false,"value":"drift"}\n');

  const registry={
    schema:'evercraft.protected-generated-artifacts.v1',
    artifacts:[{
      path:'public/generated.json',
      git_blob_sha:gitBlobSha(approved),
      authority:'governance/test.md',
      rule:'preserve_exactly_until_explicit_rivet_approval',
      approved_source_path:'governance/approved.json'
    }]
  };
  fs.writeFileSync(
    path.join(governance,'protected-generated-artifacts.json'),
    JSON.stringify(registry,null,2)+'\n'
  );

  const receipt=enforceProtectedGeneratedArtifacts({root});
  assert.equal(receipt.protected_count,1);
  assert.equal(receipt.production_authority_granted,false);
  assert.equal(
    fs.readFileSync(path.join(publicDir,'generated.json'),'utf8'),
    approved.toString('utf8')
  );
  assert.equal(receipt.artifacts[0].git_blob_sha,registry.artifacts[0].git_blob_sha);

  fs.writeFileSync(path.join(governance,'approved.json'),'{"approved":true,"value":"tampered"}\n');
  assert.throws(
    ()=>enforceProtectedGeneratedArtifacts({root}),
    /protected_generated_artifact_approved_source_drift/
  );

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.protected-generated-artifacts.test.v1',
    exact_restoration:true,
    approved_source_drift_fails_closed:true
  },null,2));
}finally{
  fs.rmSync(root,{recursive:true,force:true});
}
