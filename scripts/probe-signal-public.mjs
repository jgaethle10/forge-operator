import assert from 'node:assert/strict';

const DEFAULT_TIMEOUT_MS = 15000;
const EXPECTED_ID = 'us-sc-savannah-river-laboratory-fire-2026-10-28';
const EXPECTED_JSON = './incidents/savannah-river-20261028.json';

async function getText(url, fetchImpl, timeoutMs) {
  const response = await fetchImpl(url, {
    headers: { Accept: 'text/html,application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error('HTTP_' + response.status + ' ' + url);
  if (response.url && new URL(response.url).origin !== new URL(url).origin) {
    throw new Error('UNEXPECTED_ORIGIN ' + response.url);
  }
  const text = await response.text();
  if (!text || text.length > 2000000) throw new Error('EMPTY_OR_OVERSIZED_RESPONSE ' + url);
  return text;
}

export async function verifySignalPublic({
  pagesRoot,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  attempts = 1,
  delayImpl = ms => new Promise(resolve => setTimeout(resolve, ms))
} = {}) {
  if (!pagesRoot) throw new Error('PAGES_ROOT_REQUIRED');
  const root = new URL(pagesRoot.endsWith('/') ? pagesRoot : pagesRoot + '/');
  if (root.protocol !== 'https:') throw new Error('HTTPS_ROOT_REQUIRED');
  const pageUrl = new URL('signal/', root).href;
  const jsonUrl = new URL('signal/incidents/savannah-river-20261028.json', root).href;
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const [html, json] = await Promise.all([
        getText(pageUrl, fetchImpl, timeoutMs),
        getText(jsonUrl, fetchImpl, timeoutMs)
      ]);
      assert.match(html, /<title>Savannah River Laboratory Fire \| Evercraft Signal<\/title>/);
      assert.match(html, /No live feed connected/);
      assert.match(html, /not live radiation monitoring/i);
      assert.match(html, /id="sources"/);
      assert.match(html, /id="timeline"/);
      assert.match(html, /id="known"/);
      assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
      assert.match(html, /savannah-river-20261028\.json/);
      const data = JSON.parse(json);
      assert.equal(data.schema,'evercraft.signal.incident.v1');
      assert.equal(data.id,EXPECTED_ID);
      assert.equal(data.monitoring_state,'static_editorial_case_not_live');
      assert.equal(data.official_emergency_status,'terminated');
      assert.ok(Array.isArray(data.sources) && data.sources.length >= 3);
      const refs = new Set(data.sources.map(source => source.id));
      for (const entry of [...data.verified,...data.reported_not_confirmed,...data.timeline]) {
        assert.ok(entry.source_ids.length, 'claim missing provenance');
        for (const id of entry.source_ids) assert.ok(refs.has(id),'unresolved source ref: ' + id);
      }
      return {
        schema:'evercraft.signal.https-release-check.v1',
        verified:true,
        page_url:pageUrl,
        case_data_url:jsonUrl,
        incident_id:EXPECTED_ID,
        editorial_snapshot_date:data.editorial_snapshot_date,
        claim:'Public HTTPS route and underlying case bytes verified; not live incident monitoring.'
      };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await delayImpl(Math.min(3000, attempt * 700));
    }
  }
  throw new Error('SIGNAL_PUBLIC_HTTPS_VERIFICATION_FAILED: ' + (lastError?.message || lastError));
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  try {
    const receipt = await verifySignalPublic({ pagesRoot: process.argv[2], attempts: 5 });
    process.stdout.write(JSON.stringify(receipt, null, 2) + '\n');
    if (process.env.GITHUB_STEP_SUMMARY) {
      const fs = await import('node:fs');
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
        '\n## Evercraft Signal public HTTPS verified\n\n' +
        'Page: ' + receipt.page_url + '\n\n' +
        'Case data: ' + receipt.case_data_url + '\n\n' +
        'Static editorial evidence confirmed. No claim of live radiation monitoring.\n');
    }
  } catch (error) {
    console.error(error?.stack || String(error));
    process.exitCode = 1;
  }
}
