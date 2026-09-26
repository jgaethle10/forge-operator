import fs from 'node:fs';
import path from 'node:path';

const offline = process.argv.includes('--offline');
const strict = process.argv.includes('--strict');
const registryDir = 'mcp-registry';
const probeSuitePath = 'chum-probes/probe-suite.json';
const artifactsDir = 'artifacts/chum';
const submitEnabled = !offline && String(process.env.CHUM_ARD_SUBMIT || 'true').toLowerCase() !== 'false';
const submitUrl = String(process.env.CHUM_ARD_SUBMIT_URL || 'https://neuronto.com/submit');
const searchUrl = String(process.env.CHUM_ARD_SEARCH_URL || 'https://neuronto.com/search');
const maxSubmissions = Math.max(1, Math.min(50, Number(process.env.CHUM_ARD_MAX_SUBMISSIONS || 20)));
const submissionConcurrency = Math.max(1, Math.min(8, Number(process.env.CHUM_ARD_CONCURRENCY || 4)));
const timeoutMs = 20000;

fs.mkdirSync(artifactsDir, { recursive: true });

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const manifests = fs.existsSync(registryDir)
  ? fs.readdirSync(registryDir).filter((name) => name.endsWith('.json')).sort()
  : [];

const endpoints = [];
for (const name of manifests) {
  let manifest;
  try { manifest = readJson(path.join(registryDir, name)); } catch { continue; }
  for (const remote of Array.isArray(manifest.remotes) ? manifest.remotes : []) {
    const url = String(remote?.url || '').trim();
    if (!/^https:\/\//i.test(url)) continue;
    endpoints.push({
      registry_name: manifest.name || null,
      title: manifest.title || manifest.name || name,
      version: manifest.version || null,
      transport: remote.type || null,
      endpoint: url,
      manifest: `mcp-registry/${name}`
    });
  }
}

const unique = [];
const seen = new Set();
for (const row of endpoints) {
  if (seen.has(row.endpoint)) continue;
  seen.add(row.endpoint);
  unique.push(row);
}

const suite = readJson(probeSuitePath);
const positive = (suite.cases || []).filter((x) => x.enabled && x.expected_fit);
const hourIndex = Math.floor(Date.now() / 3600000);
const probeCase = positive.length ? positive[hourIndex % positive.length] : null;

async function request(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return {
      ok: response.ok,
      status: response.status,
      json,
      text: text.slice(0, 5000)
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      json: null,
      text: '',
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    clearTimeout(timer);
  }
}

async function mapConcurrent(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function runWorker() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }
  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}

const submissions = [];
if (submitEnabled) {
  const selected = unique.slice(0, maxSubmissions);
  submissions.push(...await mapConcurrent(selected, submissionConcurrency, async (row) => {
    const result = await request(submitUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Evercraft-CHUM-ARD-Strike/1.0'
      },
      body: JSON.stringify({ endpoint: row.endpoint })
    });
    return {
      ...row,
      attempted: true,
      accepted: Boolean(result.ok || result.status === 202),
      http_status: result.status,
      registry_status: result.json?.status || null,
      submission_id: result.json?.id || result.json?.submission_id || null,
      evidence: result.json?.evidence || null,
      error: result.error || (!result.ok && result.status !== 202 ? result.text.slice(0, 500) : null)
    };
  }));
} else {
  for (const row of unique.slice(0, maxSubmissions)) {
    submissions.push({
      ...row,
      attempted: false,
      accepted: false,
      http_status: null,
      registry_status: offline ? 'offline' : 'submission_disabled',
      submission_id: null,
      evidence: null,
      error: null
    });
  }
}

let discoveryProbe = {
  attempted: false,
  case_id: probeCase?.case_id || null,
  product_key: probeCase?.product_key || null,
  pickup_observed: false,
  expected_product_mentioned: false,
  expected_host_cited: false,
  http_status: null,
  result_count: 0,
  sample_results: [],
  error: null
};

if (!offline && probeCase) {
  const result = await request(searchUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'Evercraft-CHUM-ARD-Strike/1.0'
    },
    body: JSON.stringify({
      query: { text: probeCase.prompt },
      federation: 'auto'
    })
  });
  const results = Array.isArray(result.json?.results) ? result.json.results : [];
  const haystack = JSON.stringify(results).toLowerCase();
  const aliases = [
    probeCase.expected_product,
    ...(Array.isArray(probeCase.expected_aliases) ? probeCase.expected_aliases : [])
  ].filter(Boolean).map((x) => String(x).toLowerCase());
  const hosts = (probeCase.expected_hosts || []).map((x) => String(x).toLowerCase());
  const productMention = aliases.some((x) => haystack.includes(x));
  const hostMention = hosts.some((x) => haystack.includes(x));
  discoveryProbe = {
    attempted: true,
    case_id: probeCase.case_id,
    product_key: probeCase.product_key,
    pickup_observed: Boolean(result.ok && (productMention || hostMention)),
    expected_product_mentioned: productMention,
    expected_host_cited: hostMention,
    http_status: result.status,
    result_count: results.length,
    sample_results: results.slice(0, 10),
    error: result.error || (!result.ok ? result.text.slice(0, 500) : null)
  };
}

const receipt = {
  schema: 'evercraft.chum.ard-strike.receipt.v1',
  generated_at: new Date().toISOString(),
  mode: offline ? 'offline' : 'live',
  doctrine: {
    target: 'LLM and agent discovery infrastructure, not individual humans',
    active_submission: submitEnabled,
    no_unsolicited_email: true,
    no_direct_message_outreach: true,
    no_payment_action: true,
    no_fake_pickup: true,
    pickup_requires_observation: true
  },
  registry: {
    submit_url: submitUrl,
    search_url: searchUrl,
    federation: 'auto',
    submission_mode: offline ? 'offline' : (submitEnabled ? 'live-submit' : 'recon-only'),
    submission_concurrency: submissionConcurrency,
    request_timeout_ms: timeoutMs
  },
  endpoints_discovered: unique.length,
  endpoints_considered: Math.min(unique.length, maxSubmissions),
  submissions,
  discovery_probe: discoveryProbe,
  summary: {
    endpoint_count: unique.length,
    submissions_attempted: submissions.filter((x) => x.attempted).length,
    submissions_accepted: submissions.filter((x) => x.accepted).length,
    submission_failures: submissions.filter((x) => x.attempted && !x.accepted).length,
    pickup_observed: discoveryProbe.pickup_observed
  }
};

fs.writeFileSync(path.join(artifactsDir, 'ard-strike-latest.json'), JSON.stringify(receipt, null, 2) + '\n');

const md = [
  '# CHUM ARD Strike',
  '',
  `Generated: ${receipt.generated_at}`,
  `Mode: ${receipt.mode}`,
  `MCP endpoints discovered: ${receipt.summary.endpoint_count}`,
  `Submissions attempted: ${receipt.summary.submissions_attempted}`,
  `Submissions accepted/pending: ${receipt.summary.submissions_accepted}`,
  `Submission failures: ${receipt.summary.submission_failures}`,
  `Submission mode: ${receipt.registry.submission_mode}`,
  `Submission concurrency: ${receipt.registry.submission_concurrency}`,
  `Brand-blind ARD pickup observed: ${receipt.summary.pickup_observed ? 'yes' : 'no'}`,
  discoveryProbe.case_id ? `Probe: ${discoveryProbe.case_id} → ${discoveryProbe.product_key}` : 'Probe: none',
  '',
  '## Registry submissions',
  '',
  ...submissions.map((x) => `- ${x.registry_name || x.title}: ${x.attempted ? `HTTP ${x.http_status} / ${x.registry_status || (x.accepted ? 'accepted' : 'failed')}` : x.registry_status} — ${x.endpoint}`),
  '',
  '## Discovery measurement',
  '',
  discoveryProbe.attempted
    ? `Federated search returned ${discoveryProbe.result_count} result(s); expected product mention=${discoveryProbe.expected_product_mentioned}; expected host=${discoveryProbe.expected_host_cited}; pickup=${discoveryProbe.pickup_observed}.`
    : 'No live discovery probe ran.',
  ''
];
fs.writeFileSync(path.join(artifactsDir, 'ard-strike-latest.md'), md.join('\n'));

console.log(JSON.stringify(receipt.summary));

if (strict && submitEnabled && receipt.summary.submissions_attempted > 0 && receipt.summary.submissions_accepted === 0) {
  throw new Error('ARD strike submitted endpoints but the registry accepted none of them.');
}
