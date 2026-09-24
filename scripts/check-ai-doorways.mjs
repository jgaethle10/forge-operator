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
        'user-agent': 'Evercraft-AI-Doorway-Canary/1.1',
        'accept': 'text/plain, application/json;q=0.9, */*;q=0.5'
      },
      signal: controller.signal
    });
    const body = await response.text();
    const contentType = response.headers.get('content-type') || '';
    const looksHtml = /^\s*<!doctype html|^\s*<html/i.test(body);
    return {
      ok: response.ok,
      status: response.status,
      content_type: contentType,
      bytes: Buffer.byteLength(body),
      body,
      looks_html: looksHtml
    };
  } catch (error) {
    return {ok:false,status:0,error:error instanceof Error ? error.message : String(error),bytes:0,body:'',looks_html:false};
  } finally {
    clearTimeout(timer);
  }
}

function validateSurface(product, kind, result) {
  const reasons = [];
  if (!result.ok) reasons.push(`http_${result.status || 'error'}`);

  if (kind === 'llms') {
    if (result.looks_html) reasons.push('html_instead_of_text');
    if (!/text\/plain/i.test(result.content_type || '')) reasons.push('unexpected_content_type');
    if (!result.body.toLowerCase().includes(product.name.toLowerCase())) reasons.push('product_identity_missing');
    if (product.conformance_state === 'reference_implementation' && !result.body.includes('ai-conformance.json')) {
      reasons.push('conformance_link_missing_or_stale');
    }
  }

  if (kind === 'conformance') {
    if (result.looks_html) reasons.push('html_spa_fallback');
    let parsed = null;
    try { parsed = JSON.parse(result.body); } catch { reasons.push('invalid_json'); }
    if (parsed && parsed.product !== product.name) reasons.push('conformance_product_mismatch');
    if (parsed && !Array.isArray(parsed.providers)) reasons.push('provider_matrix_missing');
  }

  if (kind === 'discovery') {
    if (result.looks_html) reasons.push('html_spa_fallback');
    try { JSON.parse(result.body); } catch { reasons.push('invalid_json'); }
  }

  return {valid:reasons.length===0,reasons};
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
    const validation = validateSurface(product,kind,result);
    const hard = product.doorway_state === 'live_verified' && product.conformance_state === 'reference_implementation' && (kind === 'llms' || kind === 'conformance');
    if (!validation.valid && hard) hardFailures += 1;

    const row = {
      product: product.product_key,
      kind,
      url,
      expected: hard ? 'required_live_and_valid' : (product.conformance_state === 'reference_implementation' ? 'observe_until_live_verified' : 'observe'),
      ok: result.ok,
      valid: validation.valid,
      status: result.status,
      content_type: result.content_type || '',
      bytes: result.bytes || 0,
      reasons: validation.reasons,
      sample: String(result.body || '').slice(0,120).replace(/\s+/g,' ')
    };
    rows.push(row);
    console.log(JSON.stringify(row));
  }
}

const summary = {
  checked_at: new Date().toISOString(),
  products: registry.products.length,
  checks: rows.length,
  hard_failures: hardFailures,
  invalid_surfaces: rows.filter(r=>!r.valid).length,
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
  `Invalid surfaces: ${summary.invalid_surfaces}`,
  `Hard failures: ${summary.hard_failures}`,
  '',
  '| Product | Surface | HTTP | Valid | Expectation | Reason |',
  '|---|---|---:|---|---|---|',
  ...rows.map(r => `| ${r.product} | ${r.kind} | ${r.status || 'ERR'} | ${r.valid ? 'yes' : 'no'} | ${r.expected} | ${r.reasons.join(', ') || 'ok'} |`)
];
fs.writeFileSync('artifacts/ai-doorway-canary.md', lines.join('\n')+'\n');

if (hardFailures) {
  throw new Error(`AI doorway canary found ${hardFailures} required live/valid endpoint failure(s)`);
}

console.log('AI DOORWAY CANARY PASS');
