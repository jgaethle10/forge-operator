import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import test from 'node:test';

/**
 * RIVET is a retired venture, not an active commercial product/partner.
 *
 * Preserve the historical artifacts as they existed at retirement and prohibit
 * accidental public RIVET exposure, without forcing unrelated Fabric releases
 * through an obsolete partner-approved source hash.
 *
 * WARNING: The retirement snapshot hashes document current archived bytes.
 * They do not assert that earlier report findings were technically correct,
 * that the old partner approved them, or that a payment may be collected.
 */
const archivedArtifacts=Object.freeze({
  'systemia/rivet/report-runtime.mjs':'86b66a17fd45c1ce6f7834ae88038658f438fe3d',
  'systemia/rivet/report-domain-projection.proof.mjs':'8c5ee5ff3ed9b7ae890eb34baf5b39d2444b9369',
  'systemia/rivet/session-source-registry.json':'fb17070291560f92134c4b9dd3e058bc17ad8deb',
  'public/chum/intents/rivet-site-underwriting-v1/agent.json':'0707363c71369a071ec81ca960dd0f2ad3536ba5',
  'governance/rivet-agent-approved.json':'0707363c71369a071ec81ca960dd0f2ad3536ba5',
});

function gitBlobSha(file){
  const body=fs.readFileSync(file);
  const header=Buffer.from('blob '+body.length+'\0');
  return createHash('sha1').update(Buffer.concat([header,body])).digest('hex');
}

test('retired RIVET historical artifacts remain frozen, never treated as a new approval',()=>{
  for(const [file,sha] of Object.entries(archivedArtifacts)){
    assert.equal(gitBlobSha(file),sha,'Retired historical RIVET artifact was modified: '+file);
  }
  const governance=fs.readFileSync('governance/RIVET_CHANGE_CONTROL.md','utf8');
  assert.match(governance,/Status: \*\*RETIRED/);
  assert.match(governance,/not an active product or partner/);
  assert.match(governance,/does not validate historical report conclusions/);
});

test('retired RIVET is never exposed as a public website, active order or checkout',()=>{
  const publicSite=fs.readFileSync('systemia/mcp/fabric-public-site.mjs','utf8');
  const runtime=fs.readFileSync('systemia/mcp/fabric-local-runtime.mjs','utf8');
  const offers=fs.readFileSync('systemia/mcp/public-payment-offers.mjs','utf8');
  assert.doesNotMatch(publicSite,/renderRivetLanding/);
  assert.doesNotMatch(runtime,/renderRivetLanding/);
  assert.doesNotMatch(runtime,/req\.url===['"]\/rivet/);
  assert.doesNotMatch(runtime,/rivet_public_path/);
  assert.doesNotMatch(offers,/(?:'|"| \s)rivet(?:'|"|\s)*\s*:/i);
  assert.equal(fs.existsSync('commercial/RIVET-SESSION-ADVANTAGE.md'),false);
});

test('legacy generated agent artifact stays protected from autonomous regeneration',()=>{
  const protectedArtifacts=JSON.parse(fs.readFileSync('governance/protected-generated-artifacts.json','utf8'));
  const artifact=protectedArtifacts.artifacts?.find(row=>
    row.path==='public/chum/intents/rivet-site-underwriting-v1/agent.json');
  assert.ok(artifact);
  assert.equal(artifact.git_blob_sha,archivedArtifacts['public/chum/intents/rivet-site-underwriting-v1/agent.json']);
  assert.equal(artifact.approved_source_path,'governance/rivet-agent-approved.json');
  assert.equal(gitBlobSha(artifact.approved_source_path),artifact.git_blob_sha);
  const builder=fs.readFileSync('systemia/chum/build-agent-commerce.mjs','utf8');
  assert.match(builder,/protected_generated_artifact_approved_source_drift/);
  assert.match(builder,/fs\.copyFileSync\(approvedSource,outputFile\)/);
});

console.log('Retired RIVET safety: archive frozen, no live offer, no partner signoff required for unrelated products.');
