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
        'user-agent': 'Evercraft-AI-Doorway-Canary/1.2',
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

async function checkSurface(product, kind, primaryUrl, fallbackUrl) {
  const primaryResult = await probe(primaryUrl);
  const primaryValidation = validateSurface(product, kind, primaryResult);

  let fallback = null;
  if (!primaryValidation.valid && fallbackUrl) {
    const fallbackResult = await probe(fallbackUrl);
    const fallbackValidation = validateSurface(product, kind, fallbackResult);
    fallback = {
      url: fallbackUrl,
      ...fallbackResult,
      valid: fallbackValidation.valid,
      reasons: fallbackValidation.reasons
    };
  }

  const rescued = !primaryValidation.valid && fallback?.valid === true;
  const effectiveValid = primaryValidation.valid || rescued;
  const effective = rescued ? fallback : {
    url: primaryUrl,
    ...primaryResult,
    valid: primaryValidation.valid,
    reasons: primaryValidation.reasons
  };

  return {
    product: product.product_key,
    kind,
    url: primaryUrl,
    fallback_url: fallbackUrl || null,
    effective_url: effective.url,
    source: rescued ? 'central_fallback' : 'primary',
    valid: effectiveValid,
    primary_valid: primaryValidation.valid,
    primary: {
      ok: primaryResult.ok,
      status: primaryResult.status,
      content_type: primaryResult.content_type || '',
      bytes: primaryResult.bytes || 0,
      reasons: primaryValidation.reasons,
      sample: String(primaryResult.body || '').slice(0,120).replace(/\s+/g,' ')
    },
    fallback: fallback ? {
      ok: fallback.ok,
      status: fallback.status,
      content_type: fallback.content_type || '',
      bytes: fallback.bytes || 0,
      valid: fallback.valid,
      reasons: fallback.reasons,
      sample: String(fallback.body || '').slice(0,120).replace(/\s+/g,' ')
    } : null
  };
}

let hardFailures = 0;
const rows = [];

for (const product of registry.products) {
  const checks = [
    ['llms', product.llms_url, product.central_llms_url],
    ['conformance', product.conformance_url, product.central_conformance_url],
    ['discovery', product.discovery_url, product.central_discovery_url]
  ].filter(([,url]) => Boolean(url));

  for (const [kind,url,fallbackUrl] of checks) {
    const row = await checkSurface(product, kind, url, fallbackUrl);
    const hard = product.conformance_state === 'reference_implementation' && (kind === 'llms' || kind === 'conformance');
    row.expected = hard ? 'required_live_and_valid' : 'observe';
    row.primary_repair_needed = !row.primary_valid;
    if (!row.valid && hard) hardFailures += 1;
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
  primary_surfaces_needing_repair: rows.filter(r=>r.primary_repair_needed).length,
  rescued_by_central_fallback: rows.filter(r=>r.source === 'central_fallback' && r.valid).length,
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
  `Invalid effective surfaces: ${summary.invalid_surfaces}`,
  `Primary surfaces needing repair: ${summary.primary_surfaces_needing_repair}`,
  `Rescued by central fallback: ${summary.rescued_by_central_fallback}`,
  `Hard failures: ${summary.hard_failures}`,
  '',
  '> A central fallback keeps discovery alive but does not erase the broken primary. Primary failures remain in the repair queue.',
  '',
  '| Product | Surface | Effective | Source | Primary | Expectation | Primary repair |',
  '|---|---|---|---|---|---|---|',
  ...rows.map(r => `| ${r.product} | ${r.kind} | ${r.valid ? 'valid' : 'FAIL'} | ${r.source} | ${r.primary.status || 'ERR'} | ${r.expected} | ${r.primary_repair_needed ? r.primary.reasons.join(', ') || 'yes' : 'no'} |`),
  '',
  '## Primary repair queue',
  '',
  ...(
    rows.filter(r=>r.primary_repair_needed).length
      ? rows.filter(r=>r.primary_repair_needed).map(r => `- ${r.product} / ${r.kind}: ${r.primary.reasons.join(', ') || 'invalid primary'}${r.source === 'central_fallback' ? ' (central fallback active)' : ''}`)
      : ['- No primary doorway repairs needed.']
  )
];
fs.writeFileSync('artifacts/ai-doorway-canary.md', lines.join('\n')+'\n');

if (hardFailures) {
  throw new Error(`AI doorway canary found ${hardFailures} required effective doorway failure(s)`);
}

console.log('AI DOORWAY CANARY PASS');
