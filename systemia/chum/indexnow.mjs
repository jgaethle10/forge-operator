const gateway = 'https://evercraft-ai-suite-08c4d2b8.base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/machineCommerceGateway';
const painIndex = 'https://evercraft-ai-suite-08c4d2b8.base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/machineCommerceIntentLanding';
const indexNow = 'https://api.indexnow.org/indexnow';
const host = 'evercraft-ai-suite-08c4d2b8.base44.app';

async function submit({ key, keyLocation, urlList, label }) {
  const response = await fetch(indexNow, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host, key, keyLocation, urlList })
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`${label} IndexNow HTTP ${response.status}: ${body}`);
  return { label, status: response.status, submitted: urlList.length };
}

const gatewayKeyResponse = await fetch(`${gateway}?action=indexnow-key`);
if (!gatewayKeyResponse.ok) throw new Error(`Gateway IndexNow key endpoint HTTP ${gatewayKeyResponse.status}`);
const gatewayKeyBody = await gatewayKeyResponse.json();
const gatewayKey = gatewayKeyBody.key;
if (!gatewayKey) throw new Error('Gateway IndexNow key missing');

const gatewayUrls = [
  `${gateway}?view=docs`,
  `${gateway}?view=llms`,
  `${gateway}?action=catalog`,
  `${gateway}?action=openapi`,
  `${gateway}?action=discover`
];

const gatewayReceipt = await submit({
  key: gatewayKey,
  keyLocation: `${gateway}?action=indexnow-key`,
  urlList: gatewayUrls,
  label: 'gateway'
});

const painKeyResponse = await fetch(`${painIndex}?view=indexnow-key`);
if (!painKeyResponse.ok) throw new Error(`Pain-index IndexNow key endpoint HTTP ${painKeyResponse.status}`);
const painKey = (await painKeyResponse.text()).trim();
if (!painKey) throw new Error('Pain-index IndexNow key missing');

const painDirectoryResponse = await fetch(painIndex, { headers: { accept: 'application/json' } });
if (!painDirectoryResponse.ok) throw new Error(`Pain-index directory HTTP ${painDirectoryResponse.status}`);
const painDirectory = await painDirectoryResponse.json();
const declaredPainUrls = Array.isArray(painDirectory?.pages)
  ? painDirectory.pages.map((x) => String(x?.url || '')).filter(Boolean)
  : [];

const painUrls = Array.from(new Set([
  painIndex,
  `${painIndex}?view=llms`,
  `${painIndex}?view=sitemap`,
  ...declaredPainUrls
]));

const painReceipt = await submit({
  key: painKey,
  keyLocation: `${painIndex}?view=indexnow-key`,
  urlList: painUrls,
  label: 'pain_index'
});

console.log(JSON.stringify({
  ok: true,
  gateway: gatewayReceipt,
  pain_index: painReceipt,
  total_submitted: gatewayReceipt.submitted + painReceipt.submitted
}));
