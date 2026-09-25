import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { classifyEcosystemCandidate } from '../systemia/chum/ecosystem-classifier.mjs';

execFileSync(process.execPath, ['systemia/saban/revenue-swarm.mjs'], { stdio: 'inherit' });
execFileSync(process.execPath, ['systemia/chum/llm-hunter.mjs', '--offline'], { stdio: 'inherit' });
const receipt = JSON.parse(fs.readFileSync('artifacts/chum/llm-hunter-latest.json', 'utf8'));
const publicSummary = JSON.parse(fs.readFileSync('public/chum/llm-hunter.json', 'utf8'));

assert.deepEqual(
  classifyEcosystemCandidate({
    repo: { name: 'ordinary-mcp-server', description: 'A useful MCP server', archived: false, topics: ['mcp'] },
    signals: ['mcp', 'agent_tools'],
    score: 95
  }),
  {
    state: 'recon_next',
    reason: 'mcp_project_not_verified_distribution_entrance',
    machine_entrance_candidate: false
  }
);

assert.equal(
  classifyEcosystemCandidate({
    repo: { name: 'tool-registry', description: 'Public registry for agent tools', archived: false, topics: ['registry', 'mcp'] },
    signals: ['registry', 'mcp'],
    score: 91
  }).state,
  'engage_now'
);

assert.equal(
  classifyEcosystemCandidate({
    repo: { name: 'old-marketplace', description: 'Archived MCP marketplace', archived: true, topics: ['marketplace', 'mcp'] },
    signals: ['submission', 'registry', 'marketplace', 'mcp'],
    score: 100
  }).state,
  'watch'
);


assert.equal(receipt.schema, 'evercraft.chum.llm-hunter.receipt.v1');
assert.equal(receipt.mode, 'offline');
assert.equal(receipt.doctrine.no_human_spam, true);
assert.equal(receipt.doctrine.no_unsolicited_email, true);
assert.equal(receipt.doctrine.active_distribution, true);
assert.ok(receipt.attack_loop.includes('PUBLISH_OR_SUBMIT'));
assert.ok(receipt.attack_loop.includes('PROBE_BRAND_BLIND'));
assert.ok(receipt.attack_loop.includes('REPAIR_MISS'));
assert.ok(receipt.known_provider_targets.length >= 7);
assert.ok(receipt.commercial_payload.sell_now_offers > 0);
assert.equal(receipt.commercial_payload.saban_revenue_formation_applied, true);
assert.ok(receipt.commercial_payload.prioritized_probe_cases.length > 0);
assert.ok(receipt.commercial_payload.first_dollar_focus.length > 0);
assert.ok(receipt.commercial_payload.high_value_focus.length > 0);
assert.ok(receipt.rotation?.case_id);
assert.equal(publicSummary.rules.no_human_spam, true);
assert.equal(publicSummary.rules.provider_pickup_requires_receipt, true);
assert.equal(publicSummary.rules.internal_revenue_priorities_are_not_external_recommendations, true);
assert.equal(publicSummary.rules.engage_now_requires_machine_entrance_evidence, true);
assert.equal(publicSummary.rules.archived_repositories_never_engage_now, true);
assert.equal('first_dollar_focus' in publicSummary, false);
console.log('CHUM LLM Hunter offline proof passed.');
