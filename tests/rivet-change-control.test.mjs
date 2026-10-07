import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';

function gitBlobSha(path){
  const body=fs.readFileSync(path);
  const header=Buffer.from('blob '+body.length+'\0');
  return createHash('sha1').update(Buffer.concat([header,body])).digest('hex');
}

const locked={
  'systemia/rivet/report-runtime.mjs':'b1f410305111f61f6dc132b696215676710955fb',
  'systemia/rivet/report-domain-projection.proof.mjs':'8c5ee5ff3ed9b7ae890eb34baf5b39d2444b9369',
  'systemia/rivet/session-source-registry.json':'c73a85b6a10b57ccb28cafc4cbc100c8e975d4de',
  'public/chum/intents/rivet-site-underwriting-v1/agent.json':'0707363c71369a071ec81ca960dd0f2ad3536ba5',
};

for(const [path,expected] of Object.entries(locked)){
  assert.equal(gitBlobSha(path),expected,'RIVET protected baseline changed without governance update: '+path);
}

const proof=JSON.parse(fs.readFileSync('public/chum/proof/rivet.json','utf8'));
const proofBaseline=JSON.parse(fs.readFileSync('governance/rivet-proof-semantic-baseline.json','utf8'));
assert.ok(Number.isFinite(Date.parse(String(proof.generated_at||''))),'RIVET proof generated_at must remain a valid timestamp');
delete proof.generated_at;
assert.deepEqual(proof,proofBaseline,'RIVET proof semantics changed without explicit approval');

const protectedArtifacts=JSON.parse(fs.readFileSync('governance/protected-generated-artifacts.json','utf8'));
const protectedRivet=protectedArtifacts.artifacts?.find((row)=>row.path==='public/chum/intents/rivet-site-underwriting-v1/agent.json');
assert.ok(protectedRivet,'RIVET agent output must remain registered as protected');
assert.equal(protectedRivet.git_blob_sha,'0707363c71369a071ec81ca960dd0f2ad3536ba5');

const agentBuilder=fs.readFileSync('systemia/chum/build-agent-commerce.mjs','utf8');
assert.match(agentBuilder,/protected_generated_artifact_drift/,'CHUM generator must fail closed on protected-artifact drift');
assert.match(agentBuilder,/protectedArtifacts\.get\(outputFile\)/,'CHUM generator must skip protected artifact writes');

assert.equal(fs.existsSync('commercial/RIVET-SESSION-ADVANTAGE.md'),false,'unapproved RIVET session doctrine must remain absent');

const publicSite=fs.readFileSync('systemia/mcp/fabric-public-site.mjs','utf8');
assert.doesNotMatch(publicSite,/renderRivetLanding/,'RIVET landing renderer requires explicit approval');

const runtime=fs.readFileSync('systemia/mcp/fabric-local-runtime.mjs','utf8');
assert.doesNotMatch(runtime,/renderRivetLanding/,'RIVET renderer import requires explicit approval');
assert.doesNotMatch(runtime,/req\.url===['"]\/rivet/,'RIVET public route requires explicit approval');
assert.doesNotMatch(runtime,/rivet_public_path/,'RIVET public health route requires explicit approval');

console.log(JSON.stringify({ok:true,schema:'evercraft.rivet-change-control.v1',state:'locked_explicit_approval_required'},null,2));
