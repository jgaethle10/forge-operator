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
  'public/chum/proof/rivet.json':'6ecf4026461177046da13f2b682454df72ee5ab5',
};

for(const [path,expected] of Object.entries(locked)){
  assert.equal(gitBlobSha(path),expected,'RIVET protected baseline changed without governance update: '+path);
}

const protectedArtifacts=JSON.parse(fs.readFileSync('governance/protected-generated-artifacts.json','utf8'));
const protectedRivet=protectedArtifacts.artifacts?.find((row)=>row.path==='public/chum/intents/rivet-site-underwriting-v1/agent.json');
assert.ok(protectedRivet,'RIVET agent output must remain registered as protected');
assert.equal(protectedRivet.git_blob_sha,'0707363c71369a071ec81ca960dd0f2ad3536ba5');
assert.equal(protectedRivet.approved_source_path,'governance/rivet-agent-approved.json');
assert.equal(gitBlobSha(protectedRivet.approved_source_path),'0707363c71369a071ec81ca960dd0f2ad3536ba5');

const protectedProof=protectedArtifacts.artifacts?.find((row)=>row.path==='public/chum/proof/rivet.json');
assert.ok(protectedProof,'RIVET proof output must remain registered as protected');
assert.equal(protectedProof.git_blob_sha,'6ecf4026461177046da13f2b682454df72ee5ab5');
assert.equal(protectedProof.approved_source_path,'governance/rivet-proof-approved.json');
assert.equal(gitBlobSha(protectedProof.approved_source_path),'6ecf4026461177046da13f2b682454df72ee5ab5');

const artifactEnforcer=fs.readFileSync('scripts/enforce-protected-generated-artifacts.mjs','utf8');
assert.match(artifactEnforcer,/protected_generated_artifact_approved_source_drift/,'protected artifact enforcer must fail closed when approved source drifts');
assert.match(artifactEnforcer,/fs\.copyFileSync\(approved,target\)/,'protected artifact enforcer must restore approved bytes');

const proofWorkflow=fs.readFileSync('.github/workflows/evercraft-proof-factory.yml','utf8');
assert.match(proofWorkflow,/node scripts\/enforce-protected-generated-artifacts\.mjs/,'Proof Factory must restore protected outputs before publishing');

const agentBuilder=fs.readFileSync('systemia/chum/build-agent-commerce.mjs','utf8');
assert.match(agentBuilder,/protected_generated_artifact_approved_source_drift/,'CHUM generator must fail closed if the approved snapshot drifts');
assert.match(agentBuilder,/fs\.copyFileSync\(approvedSource,outputFile\)/,'CHUM generator must materialize RIVET only from the approved snapshot');
assert.match(agentBuilder,/protectedArtifacts\.get\(outputFile\)/,'CHUM generator must route protected artifacts through governance');

assert.equal(fs.existsSync('commercial/RIVET-SESSION-ADVANTAGE.md'),false,'unapproved RIVET session doctrine must remain absent');

const publicSite=fs.readFileSync('systemia/mcp/fabric-public-site.mjs','utf8');
assert.doesNotMatch(publicSite,/renderRivetLanding/,'RIVET landing renderer requires explicit approval');

const runtime=fs.readFileSync('systemia/mcp/fabric-local-runtime.mjs','utf8');
assert.doesNotMatch(runtime,/renderRivetLanding/,'RIVET renderer import requires explicit approval');
assert.doesNotMatch(runtime,/req\.url===['"]\/rivet/,'RIVET public route requires explicit approval');
assert.doesNotMatch(runtime,/rivet_public_path/,'RIVET public health route requires explicit approval');

console.log(JSON.stringify({ok:true,schema:'evercraft.rivet-change-control.v1',state:'locked_explicit_approval_required'},null,2));
