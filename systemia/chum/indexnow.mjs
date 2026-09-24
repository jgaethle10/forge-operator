import fs from 'node:fs';

const gateway = 'https://evercraft-ai-suite-08c4d2b8.base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/machineCommerceGateway';
const edgeHost = 'findmypart.base44.app';
const edgeKeyLocation = 'https://findmypart.base44.app/functions/indexNowKey';
const edgeKey = '9f7c2a4e8b1d6f3a5c0e7b9d2f4a6c8e';
const edgeUrls = [
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
  edge_submitted: 0,
  edge_http_status: null
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
    receipt.http_status ? 'Central IndexNow HTTP: ' + receipt.http_status : null,
    receipt.edge_http_status ? 'Edge IndexNow HTTP: ' + receipt.edge_http_status : null,
    'Edge protocol URLs: ' + receipt.edge_submitted,
    receipt.error ? 'Error: ' + receipt.error : null,
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
  const edgeKeyResponse = await fetch(edgeKeyLocation, {
    headers: { 'user-agent': 'Evercraft-CHUM/0.4.1 (+edge-indexnow-key-check)' }
  });
  if (!edgeKeyResponse.ok) throw new Error('Edge IndexNow key endpoint HTTP ' + edgeKeyResponse.status);
  if ((await edgeKeyResponse.text()).trim() !== edgeKey) throw new Error('Edge IndexNow key mismatch');

  const edgeResponse = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host: edgeHost,
      key: edgeKey,
      keyLocation: edgeKeyLocation,
      urlList: edgeUrls
    })
  });
  receipt.edge_http_status = edgeResponse.status;
  receipt.edge_submitted = edgeUrls.length;
  receipt.urls = [...new Set([...receipt.urls, ...edgeUrls])];
  if (!edgeResponse.ok) throw new Error('Edge IndexNow HTTP ' + edgeResponse.status + ': ' + await edgeResponse.text());

  receipt.status = 'accepted';
  writeReceipt();
  console.log(JSON.stringify({
    ok: true,
    status: response.status,
    submitted: urlList.length,
    capability_pages: receipt.capability_pages,
    sell_now_pages: receipt.sell_now_pages,
    preflight_failed: receipt.preflight_failed.length,
    edge_submitted: receipt.edge_submitted,
    edge_http_status: receipt.edge_http_status
  }));
} catch (error) {
  receipt.status = 'failed';
  receipt.error = error instanceof Error ? error.message : String(error);
  writeReceipt();
  throw error;
}
