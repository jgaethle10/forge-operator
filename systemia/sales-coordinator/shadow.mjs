import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { proofFirstState } from '../proof-first-sales/engine.mjs';

const repo = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '../..'
);

const campaignFile = path.join(
  repo,
  'systemia/proof-first-sales/campaigns/yakima-hvac-2026-10.json'
);

const outputDir = path.join(repo, 'artifacts/sales-coordinator');

const campaign = JSON.parse(fs.readFileSync(campaignFile, 'utf8'));
const now = new Date();

const targets = campaign.targets.map((target) => {
  const state = proofFirstState({
    ...target,
    ...campaign.policy
  }, now);

  return {
    prospect_key: target.prospect_key,
    business: target.business,
    campaign_unanswered_outbound: target.unanswered_outbound,
    campaign_pain_evidence_state: target.pain_evidence_state,
    campaign_proof_state: target.proof_state,
    campaign_last_outbound_at: target.last_outbound_at,
    proof_first_state: state,
    relationship_ledger_verified: false,
    provider_delivery_verified: false,
    contact_authorized: false,
    next_action: 'reconcile_relationship_before_contact'
  };
});

const report = {
  schema: 'evercraft.sales-coordinator.shadow.v1',
  mission: campaign.mission_key,
  generated_at: now.toISOString(),
  execution_mode: 'shadow',
  source: 'committed_campaign_snapshot',
  authoritative_relationship_state: false,
  external_actions_performed: false,
  messages_sent: 0,
  payments_collected: 0,
  targets
};

fs.mkdirSync(outputDir, { recursive: true, mode: 0o700 });

const destination = path.join(outputDir, 'latest.json');
const temporary = destination + '.' + process.pid + '.tmp';

fs.writeFileSync(
  temporary,
  JSON.stringify(report, null, 2) + '\n',
  { mode: 0o600 }
);

fs.renameSync(temporary, destination);

console.log(JSON.stringify({
  mission: report.mission,
  mode: report.execution_mode,
  targets: targets.length,
  contact_authorized: 0,
  messages_sent: 0,
  output: destination
}, null, 2));
