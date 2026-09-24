import fs from 'node:fs';

const registry = JSON.parse(fs.readFileSync('conformance/products.json','utf8'));
const timeoutMs = 15000;

async function probe(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'user-agent': 'Evercraft-AI-Doorway-Canary/1.0',
        'accept': 'text/plain, application/json;q=0.9, */*;q=0.5'
      },
      signal: controller.signal
    });
    const body = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      content_type: response.headers.get('content-type') || '',
      bytes: Buffer.byteLength(body),
      sample: body.slice(0,120).replace(/\s+/g,' ')
    };
  } catch (error) {
    return {ok:false,status:0,error:error instanceof Error ? error.message : String(error),bytes:0};
  } finally {
    clearTimeout(timer);
  }
}

let hardFailures = 0;
const rows = [];

for (const product of registry.products) {
  const checks = [
    ['llms', product.llms_url],
    ['conformance', product.conformance_url],
    ['discovery', product.discovery_url]
  ].filter(([,url]) => Boolean(url));

  for (const [kind,url] of checks) {
    const result = await probe(url);
    const hard = product.conformance_state === 'reference_implementation' && (kind === 'llms' || kind === 'conformance');
    if (!result.ok && hard) hardFailures += 1;

    rows.push({
      product: product.product_key,
      kind,
      url,
      expected: hard ? 'required_live' : 'observe',
      ...result
    });

    console.log(JSON.stringify(rows.at(-1)));
  }
}

const summary = {
  checked_at: new Date().toISOString(),
  products: registry.products.length,
  checks: rows.length,
  hard_failures: hardFailures,
  rows
};

fs.mkdirSync('artifacts',{recursive:true});
fs.writeFileSync('artifacts/ai-doorway-canary.json', JSON.stringify(summary,null,2));

const lines = [
  '# Evercraft AI Doorway Canary',
  '',
  `Checked: ${summary.checked_at}`,
  `Products: ${summary.products}`,
  `Endpoints: ${summary.checks}`,
  `Hard failures: ${summary.hard_failures}`,
  '',
  '| Product | Surface | Status | Expectation |',
  '|---|---|---:|---|',
  ...rows.map(r => `| ${r.product} | ${r.kind} | ${r.status || 'ERR'} | ${r.expected} |`)
];
fs.writeFileSync('artifacts/ai-doorway-canary.md', lines.join('\n')+'\n');

if (hardFailures) {
  throw new Error(`AI doorway canary found ${hardFailures} required live endpoint failure(s)`);
}

console.log('AI DOORWAY CANARY PASS');
