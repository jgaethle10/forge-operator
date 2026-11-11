import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=(path)=>JSON.parse(fs.readFileSync(root+path,'utf8'));
const evidence=read('distribution/openai-plugin/public-listing-observation-2026-11-10.json');
const submission=read('distribution/openai-plugin/submission.json');
const pluginSubmission=read('plugins/evercraft-fabric/openai-submission.json');
const manifest=read('plugins/evercraft-fabric/plugin.json');
const publisher=read('systemia/distribution/publisher-ownership.json');

test('existing Evercraft public listing is recorded as provider-portal evidence, not a private release',()=>{
  assert.equal(evidence.portal.directory_listing_label,'Listed publicly');
  assert.equal(evidence.portal.publication_version,'1.0.2');
  assert.equal(evidence.listing_name,'Evercraft');
  assert.equal(evidence.publisher,'Evercraft LLC');
  assert.equal(evidence.portal.submitted_mcp_origin,'https://fabric.systemiacommandcenters.com/mcp');
  assert.equal(evidence.evidence_type,'founder_provided_openai_platform_dashboard_screenshot');
  assert.notEqual(evidence.release_tracking.public_version,evidence.release_tracking.current_source_version);
});
test('prepared v1.0.6 is an in-place upgrade, not a second public listing or completed update',()=>{
  assert.equal(manifest.version,'1.0.6');
  assert.equal(submission.package_version,manifest.version);
  assert.equal(pluginSubmission.package_version,manifest.version);
  assert.equal(submission.existing_public_listing.portal_observed_version,'1.0.2');
  assert.equal(submission.existing_public_listing.release_action,'update_existing_listing_not_create_new');
  assert.equal(pluginSubmission.existing_public_listing.upgrade_publication_status,'not_confirmed');
  assert.equal(evidence.release_tracking.update_existing_public_listing,true);
  assert.equal(evidence.release_tracking.upgrade_state,'not_submitted_or_confirmed');
});
test('public portal status must not be misreported as independent discovery, sales or provider pickup',()=>{
  assert.equal(submission.public_directory_claim_allowed,false);
  assert.equal(pluginSubmission.public_directory_claim_allowed,false);
  assert.equal(evidence.independent_observations.independent_fresh_account_install,'not_tested');
  assert.equal(evidence.independent_observations.independent_external_chatgpt_tool_invocation,'not_tested');
  assert.equal(evidence.independent_observations.customer_conversion,'not_measured');
  assert.equal(evidence.boundaries.do_not_create_duplicate_public_listing,true);
  const listed=publisher.entries.filter(x=>x.key==='chatgpt-evercraft-public-102');
  assert.equal(listed.length,1);
  assert.equal(listed[0].status,'PORTAL_LISTED_PUBLICLY_OBSERVED');
  assert.equal(listed[0].release,'1.0.2');
  assert.equal(listed[0].evidence.independent_fresh_account_discovery,false);
});
