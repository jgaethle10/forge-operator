import fs from 'node:fs';

const OPERATOR_URL =
  process.env.EVERCRAFT_DISTRIBUTION_OPERATOR_URL ||
  'https://findmypart.base44.app/functions/evercraftDistributionOperator?action=reconcile';
const OUTPUT_JSON = 'artifacts/chum/distribution-latest.json';
const OUTPUT_MD = 'artifacts/chum/distribution-latest.md';
const strict = process.argv.includes('--strict');
const timeoutMs = 30000;

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), timeoutMs);
let response;
try {
  response = await fetch(OPERATOR_URL, {
    headers: {
      accept: 'application/json',
      'user-agent': 'Evercraft-CHUM/0.4.1 (+distribution-reconcile)'
    },
    signal: controller.signal
  });
} finally {
  clearTimeout(timer);
}

if (!response.ok) throw new Error(`Distribution Operator HTTP ${response.status}`);
const live = await response.json();
if (live?.ok !== true || live?.operator !== 'systemia.ai-distribution-operator.v1') {
  throw new Error('Distribution Operator returned an invalid response.');
}

const targets = Array.isArray(live.targets) ? live.targets : [];
const active = targets.filter((x) =>
  ['active', 'active_degraded'].includes(String(x.state || ''))
).length;
const pending = targets.filter((x) =>
  ['package_ready', 'submitted', 'review'].includes(String(x.state || ''))
).length;
const repair = targets.filter((x) => String(x.state || '') === 'repair').length;

const receipt = {
  schema: 'evercraft.chum.distribution-receipt.v1',
  generated_at: new Date().toISOString(),
  operator_url: OPERATOR_URL,
  operator: live.operator,
  runtime: live.runtime || null,
  registry: live.registry || null,
  protocols: live.protocols || null,
  grok: live.grok || null,
  summary: {
    targets: targets.length,
    active,
    pending,
    repair,
    founder_attention_required: Boolean(live.founder_attention_required)
  },
  targets,
  rule: live.rule || ''
};

fs.mkdirSync('artifacts/chum', { recursive: true });
fs.writeFileSync(OUTPUT_JSON, JSON.stringify(receipt, null, 2) + '\n');

const md = [
  '# CHUM Distribution Receipt',
  '',
  `Generated: ${receipt.generated_at}`,
  `Targets: ${receipt.summary.targets}`,
  `Active: ${receipt.summary.active}`,
  `Pending: ${receipt.summary.pending}`,
  `Repair: ${receipt.summary.repair}`,
  `Founder attention required: ${receipt.summary.founder_attention_required ? 'yes' : 'no'}`,
  '',
  '| Target | State | Automation | Human gate | Next |',
  '|---|---|---|---|---|',
  ...targets.map((t) =>
    `| ${String(t.key || '')} | ${String(t.state || '')} | ${String(t.automation || '')} | ${t.human_gate ? 'yes' : 'no'} | ${String(t.next || '').replace(/\|/g, '\\|')} |`
  ),
  '',
  '> Registry or marketplace publication is not proof of provider recommendation. Provider pickup remains a separate receipt-backed CHUM probe.',
  ''
];
fs.writeFileSync(OUTPUT_MD, md.join('\n'));

console.log(JSON.stringify(receipt.summary));
console.log(`CHUM distribution receipt: ${OUTPUT_JSON}`);

if (strict && (receipt.protocols?.ok === false || receipt.summary.founder_attention_required)) {
  throw new Error(
    `CHUM distribution strict failure: protocols_ok=${receipt.protocols?.ok !== false} founder_attention_required=${receipt.summary.founder_attention_required}`
  );
}
