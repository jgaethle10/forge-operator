import fs from 'node:fs';

const OPERATOR_URL =
  process.env.EVERCRAFT_DISTRIBUTION_OPERATOR_URL ||
  'https://findmypart.base44.app/functions/evercraftDistributionOperator?action=reconcile';

const strict = process.argv.includes('--strict');
const timeoutMs = 30000;
const outDir = 'artifacts/chum';
const jsonPath = outDir + '/distribution-latest.json';
const mdPath = outDir + '/distribution-latest.md';

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), timeoutMs);
let response;

try {
  response = await fetch(OPERATOR_URL, {
    headers: {
      accept: 'application/json',
      'user-agent': 'Evercraft-CHUM/0.6 (+distribution-reconcile)'
    },
    signal: controller.signal
  });
} finally {
  clearTimeout(timer);
}

if (!response.ok) {
  throw new Error(`Distribution Operator HTTP ${response.status}`);
}

const live = await response.json();
if (
  live?.ok !== true ||
  live?.operator !== 'systemia.ai-distribution-operator.v1'
) {
  throw new Error('Distribution Operator returned an invalid response.');
}

const targets = Array.isArray(live.targets) ? live.targets : [];
const activeStates = new Set(['active', 'active_degraded']);
const pendingStates = new Set(['package_ready', 'submitted', 'review', 'qa']);

const summary = {
  targets: targets.length,
  active: targets.filter((x) => activeStates.has(String(x.state || ''))).length,
  pending: targets.filter((x) => pendingStates.has(String(x.state || ''))).length,
  repair: targets.filter((x) => String(x.state || '') === 'repair').length,
  blocked: targets.filter((x) => String(x.state || '') === 'blocked').length,
  human_gates: targets.filter((x) => Boolean(x.human_gate)).length,
  founder_attention_required: Boolean(live.founder_attention_required)
};

const criticalFailures = [];
if (live?.protocols?.ok === false) {
  criticalFailures.push('public_protocol_canary_failed');
}
if (live?.registry?.ok === false && live?.registry?.probe_degraded !== true) {
  criticalFailures.push('official_registry_verification_failed');
}
if (summary.founder_attention_required) {
  criticalFailures.push('founder_attention_required');
}

const receipt = {
  schema: 'evercraft.chum.distribution-receipt.v2',
  generated_at: new Date().toISOString(),
  operator_url: OPERATOR_URL,
  operator: live.operator,
  runtime: live.runtime || null,
  reconciled_at: live.reconciled_at || null,
  registry: live.registry || null,
  protocols: live.protocols || null,
  grok: live.grok || null,
  summary,
  targets,
  critical_failures: criticalFailures,
  rule:
    live.rule ||
    'Routine packaging, submission, retry and verification remain with Systemia. Only non-delegable identity, MFA, CAPTCHA or legal gates may become human work.',
  truth_boundary:
    'Registry, marketplace or connector presence is not proof that a consumer AI provider recommended Evercraft or that any payment occurred.'
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(jsonPath, JSON.stringify(receipt, null, 2) + '\n');

const md = [
  '# CHUM Distribution Receipt',
  '',
  `Generated: ${receipt.generated_at}`,
  `Targets: ${summary.targets}`,
  `Active: ${summary.active}`,
  `Pending: ${summary.pending}`,
  `Repair: ${summary.repair}`,
  `Blocked: ${summary.blocked}`,
  `Human gates: ${summary.human_gates}`,
  `Founder attention required: ${summary.founder_attention_required ? 'yes' : 'no'}`,
  `Registry verified: ${live?.registry?.ok === true ? 'yes' : live?.registry?.probe_degraded ? 'probe degraded' : 'no'}`,
  `Protocol canaries: ${live?.protocols?.ok === true ? 'healthy' : 'unhealthy'}`,
  '',
  '| Target | State | Automation | Human gate | Next |',
  '|---|---|---|---|---|',
  ...targets.map((target) =>
    `| ${String(target.key || '')} | ${String(target.state || '')} | ${String(target.automation || '')} | ${target.human_gate ? 'yes' : 'no'} | ${String(target.next || '').replace(/\|/g, '\\|')} |`
  ),
  '',
  '> Publication, installation or directory presence is not provider pickup, recommendation, payment or conversion.',
  ''
];

if (criticalFailures.length) {
  md.push('## Critical failures', '');
  for (const failure of criticalFailures) md.push(`- ${failure}`);
  md.push('');
}

fs.writeFileSync(mdPath, md.join('\n'));

console.log(
  JSON.stringify({
    ...summary,
    critical_failures: criticalFailures.length,
    output: jsonPath
  })
);

if (strict && criticalFailures.length) {
  throw new Error(
    `CHUM distribution reconciliation found critical failure(s): ${criticalFailures.join(', ')}`
  );
}
