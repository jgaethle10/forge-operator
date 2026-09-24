import fs from 'node:fs';

const gateway = 'https://evercraft-ai-suite-08c4d2b8.base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/machineCommerceGateway';
const painIndex = 'https://evercraft-ai-suite-08c4d2b8.base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/machineCommerceIntentLanding';
const edgeHost = 'findmypart.base44.app';
const edgeIndexNowKey = 'https://findmypart.base44.app/functions/indexNowKey';
const edgeProtocolUrls = [
  'https://findmypart.base44.app/functions/evercraftCapabilityDiscoveryMcp',
  'https://findmypart.base44.app/functions/evercraftMachineCommerceMcp',
  'https://findmypart.base44.app/functions/evercraftCapabilityA2A',
  'https://findmypart.base44.app/functions/evercraftUniversalAgentGateway'
];
const artifactsDir = 'artifacts/chum';
fs.mkdirSync(artifactsDir, { recursive: true });

const receipt = {
  schema: 'evercraft.chum.indexnow.v2',
  generated_at: new Date().toISOString(),
  gateway,
  status: 'started',
  submitted: 0,
  capability_pages: 0,
  sell_now_pages: 0,
  urls: [],
  preflight_failed: [],
  pain_index: {
    status: 'pending',
    submitted: 0,
    pages: 0,
    urls: [],
    preflight_failed: []
  },
  edge_protocols: {
    status: 'pending',
    submitted: 0,
    urls: [],
    preflight_failed: []
  }
};

function writeReceipt() {
  fs.writeFileSync(artifactsDir + '/indexnow-latest.json', JSON.stringify(receipt, null, 2) + '\n');
  const md = [
    '# CHUM Freshness Broadcast Receipt',
    '',
    'Generated: ' + receipt.generated_at,
    'Status: ' + receipt.status,
    'Submitted URLs: ' + receipt.submitted,
    'Capability service pages: ' + receipt.capability_pages,
    'Sell-now offer pages: ' + receipt.sell_now_pages,
    receipt.http_status ? 'IndexNow HTTP: ' + receipt.http_status : null,
    receipt.error ? 'Error: ' + receipt.error : null,
    'Pain index status: ' + receipt.pain_index.status,
    'Pain index URLs submitted: ' + receipt.pain_index.submitted,
    'Pain pages declared: ' + receipt.pain_index.pages,
    receipt.pain_index.http_status ? 'Pain IndexNow HTTP: ' + receipt.pain_index.http_status : null,
    receipt.pain_index.error ? 'Pain index error: ' + receipt.pain_index.error : null,
    'Edge protocol status: ' + receipt.edge_protocols.status,
    'Edge protocol URLs submitted: ' + receipt.edge_protocols.submitted,
    receipt.edge_protocols.http_status ? 'Edge IndexNow HTTP: ' + receipt.edge_protocols.http_status : null,
    receipt.edge_protocols.error ? 'Edge protocol error: ' + receipt.edge_protocols.error : null,
    '',
    '## Submitted surfaces',
    '',
    ...receipt.urls.map((url) => '- ' + url),
    '',
    ...(receipt.preflight_failed.length ? [
      '## Preflight failures',
      '',
      ...receipt.preflight_failed.map((row) => '- ' + row.url + ': HTTP ' + (row.status || 0) + (row.error ? ' ' + row.error : '')),
      ''
    ] : []),
    ...(receipt.pain_index.urls.length ? [
      '## Pain-index surfaces',
      '',
      ...receipt.pain_index.urls.map((url) => '- ' + url),
      ''
    ] : []),
    ...(receipt.pain_index.preflight_failed.length ? [
      '## Pain-index preflight failures',
      '',
      ...receipt.pain_index.preflight_failed.map((row) => '- ' + row.url + ': HTTP ' + (row.status || 0) + (row.error ? ' ' + row.error : '')),
      ''
    ] : []),
    ...(receipt.edge_protocols.urls.length ? [
      '## Edge protocol surfaces',
      '',
      ...receipt.edge_protocols.urls.map((url) => '- ' + url),
      ''
    ] : []),
    ...(receipt.edge_protocols.preflight_failed.length ? [
      '## Edge protocol preflight failures',
      '',
      ...receipt.edge_protocols.preflight_failed.map((row) => '- ' + row.url + ': HTTP ' + (row.status || 0) + (row.error ? ' ' + row.error : '')),
      ''
    ] : [])
  ].filter((value) => value !== null);
  fs.writeFileSync(artifactsDir + '/indexnow-latest.md', md.join('\n'));
}

try {
  const [keyResponse, catalogResponse] = await Promise.all([
    fetch(gateway + '?action=indexnow-key', {
      headers: { 'user-agent': 'Evercraft-CHUM/0.4 (+freshness-broadcast)' }
    }),
    fetch(gateway + '?action=catalog', {
      headers: { accept: 'application/json', 'user-agent': 'Evercraft-CHUM/0.4 (+freshness-broadcast)' }
    })
  ]);

  if (!keyResponse.ok) throw new Error('IndexNow key endpoint HTTP ' + keyResponse.status);
  if (!catalogResponse.ok) throw new Error('Machine Commerce catalog HTTP ' + catalogResponse.status);

  const rawKey = (await keyResponse.text()).trim();
  let key = rawKey;
  try {
    const parsed = JSON.parse(rawKey);
    key = String(parsed?.key || parsed?.indexnow_key || parsed || '').trim();
  } catch {
    key = rawKey.replace(/^["']|["']$/g, '').trim();
  }
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(key)) throw new Error('IndexNow key missing or malformed');

  const catalog = await catalogResponse.json();
  const offers = Array.isArray(catalog?.offers) ? catalog.offers : [];
  const baseUrls = [
    gateway + '?view=docs',
    gateway + '?view=llms',
    gateway + '?action=catalog',
    gateway + '?action=openapi',
    gateway + '?action=discover',
    gateway + '?action=web'
  ];

  const servicePages = offers
    .filter((offer) => String(offer?.public_id || '').trim())
    .map((offer) => gateway + '?view=service&public_id=' + encodeURIComponent(String(offer.public_id)));

  const sellNowPages = offers
    .filter((offer) => offer?.commercial_state === 'sell_now' && String(offer?.public_id || '').trim())
    .map((offer) => gateway + '?action=offer&public_id=' + encodeURIComponent(String(offer.public_id)));

  const candidates = [...new Set([...baseUrls, ...servicePages, ...sellNowPages])];

  const checked = await Promise.all(candidates.map(async (url) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'user-agent': 'Evercraft-CHUM/0.4 (+indexnow-preflight)',
          accept: 'text/html,application/json,text/plain;q=0.8,*/*;q=0.3'
        },
        signal: controller.signal
      });
      return { url, ok: response.ok, status: response.status };
    } catch (error) {
      return { url, ok: false, status: 0, error: error instanceof Error ? error.message : String(error) };
    } finally {
      clearTimeout(timer);
    }
  }));

  const urlList = checked.filter((row) => row.ok).map((row) => row.url);
  receipt.preflight_failed = checked.filter((row) => !row.ok);
  receipt.urls = urlList;
  receipt.capability_pages = servicePages.filter((url) => urlList.includes(url)).length;
  receipt.sell_now_pages = sellNowPages.filter((url) => urlList.includes(url)).length;

  if (!urlList.length) throw new Error('No healthy public discovery URLs survived IndexNow preflight');

  const response = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host: 'evercraft-ai-suite-08c4d2b8.base44.app',
      key,
      keyLocation: gateway + '?action=indexnow-key',
      urlList
    })
  });

  receipt.http_status = response.status;
  receipt.submitted = urlList.length;
  if (!response.ok) throw new Error('IndexNow HTTP ' + response.status + ': ' + await response.text());
  receipt.status = 'accepted';

  const [painKeyResponse, painDirectoryResponse] = await Promise.all([
    fetch(painIndex + '?view=indexnow-key', {
      headers: { 'user-agent': 'Evercraft-CHUM/0.4 (+pain-index-broadcast)' }
    }),
    fetch(painIndex, {
      headers: { accept: 'application/json', 'user-agent': 'Evercraft-CHUM/0.4 (+pain-index-broadcast)' }
    })
  ]);
  if (!painKeyResponse.ok) throw new Error('Pain-index IndexNow key endpoint HTTP ' + painKeyResponse.status);
  if (!painDirectoryResponse.ok) throw new Error('Pain-index directory HTTP ' + painDirectoryResponse.status);

  const painKey = (await painKeyResponse.text()).trim().replace(/^["']|["']$/g, '');
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(painKey)) throw new Error('Pain-index IndexNow key missing or malformed');
  const painDirectory = await painDirectoryResponse.json();
  const painPages = Array.isArray(painDirectory?.pages)
    ? painDirectory.pages.map((row) => String(row?.url || '').trim()).filter(Boolean)
    : [];
  const painCandidates = [...new Set([
    painIndex,
    painIndex + '?view=llms',
    painIndex + '?view=sitemap',
    ...painPages
  ])];

  const painChecked = await Promise.all(painCandidates.map(async (url) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'user-agent': 'Evercraft-CHUM/0.4 (+pain-index-preflight)',
          accept: 'text/html,application/json,text/plain,application/xml;q=0.8,*/*;q=0.3'
        },
        signal: controller.signal
      });
      return { url, ok: response.ok, status: response.status };
    } catch (error) {
      return { url, ok: false, status: 0, error: error instanceof Error ? error.message : String(error) };
    } finally {
      clearTimeout(timer);
    }
  }));
  const painUrls = painChecked.filter((row) => row.ok).map((row) => row.url);
  receipt.pain_index.pages = painPages.length;
  receipt.pain_index.urls = painUrls;
  receipt.pain_index.preflight_failed = painChecked.filter((row) => !row.ok);
  if (!painUrls.length) throw new Error('No healthy pain-index URLs survived IndexNow preflight');

  const painResponse = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host: 'evercraft-ai-suite-08c4d2b8.base44.app',
      key: painKey,
      keyLocation: painIndex + '?view=indexnow-key',
      urlList: painUrls
    })
  });
  receipt.pain_index.http_status = painResponse.status;
  receipt.pain_index.submitted = painUrls.length;
  if (!painResponse.ok) throw new Error('Pain-index IndexNow HTTP ' + painResponse.status + ': ' + await painResponse.text());
  receipt.pain_index.status = 'accepted';

  const edgeKeyResponse = await fetch(edgeIndexNowKey, {
    headers: { 'user-agent': 'Evercraft-CHUM/0.6 (+edge-indexnow-key)' }
  });
  if (!edgeKeyResponse.ok) {
    throw new Error('Edge IndexNow key endpoint HTTP ' + edgeKeyResponse.status);
  }
  const edgeKey = (await edgeKeyResponse.text()).trim().replace(/^["']|["']$/g, '');
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(edgeKey)) {
    throw new Error('Edge IndexNow key missing or malformed');
  }

  const edgeChecked = await Promise.all(edgeProtocolUrls.map(async (url) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'user-agent': 'Evercraft-CHUM/0.6 (+edge-indexnow-preflight)',
          accept: 'text/html,application/json,text/plain;q=0.8,*/*;q=0.3'
        },
        signal: controller.signal
      });
      return { url, ok: response.ok, status: response.status };
    } catch (error) {
      return {
        url,
        ok: false,
        status: 0,
        error: error instanceof Error ? error.message : String(error)
      };
    } finally {
      clearTimeout(timer);
    }
  }));

  const healthyEdgeUrls = edgeChecked.filter((row) => row.ok).map((row) => row.url);
  receipt.edge_protocols.urls = healthyEdgeUrls;
  receipt.edge_protocols.preflight_failed = edgeChecked.filter((row) => !row.ok);

  if (!healthyEdgeUrls.length) {
    throw new Error('No healthy edge protocol URLs survived IndexNow preflight');
  }

  const edgeResponse = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host: edgeHost,
      key: edgeKey,
      keyLocation: edgeIndexNowKey,
      urlList: healthyEdgeUrls
    })
  });

  receipt.edge_protocols.http_status = edgeResponse.status;
  receipt.edge_protocols.submitted = healthyEdgeUrls.length;
  if (!edgeResponse.ok) {
    throw new Error('Edge IndexNow HTTP ' + edgeResponse.status + ': ' + await edgeResponse.text());
  }
  receipt.edge_protocols.status = 'accepted';

  writeReceipt();
  console.log(JSON.stringify({
    ok: true,
    status: response.status,
    submitted: urlList.length,
    capability_pages: receipt.capability_pages,
    sell_now_pages: receipt.sell_now_pages,
    preflight_failed: receipt.preflight_failed.length,
    pain_index_status: receipt.pain_index.status,
    pain_index_submitted: receipt.pain_index.submitted,
    pain_pages: receipt.pain_index.pages,
    pain_preflight_failed: receipt.pain_index.preflight_failed.length,
    edge_protocol_status: receipt.edge_protocols.status,
    edge_protocol_submitted: receipt.edge_protocols.submitted,
    edge_protocol_preflight_failed: receipt.edge_protocols.preflight_failed.length
  }));
} catch (error) {
  receipt.status = 'failed';
  receipt.error = error instanceof Error ? error.message : String(error);
  writeReceipt();
  throw error;
}
