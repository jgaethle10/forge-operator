const gateway = 'https://evercraft-ai-suite-08c4d2b8.base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/machineCommerceGateway';
const keyResponse = await fetch(`${gateway}?action=indexnow-key`);
if (!keyResponse.ok) throw new Error(`IndexNow key endpoint HTTP ${keyResponse.status}`);
const rawKey = (await keyResponse.text()).trim();
let key = rawKey;
try {
  const parsed = JSON.parse(rawKey);
  key = String(parsed?.key || parsed?.indexnow_key || parsed || '').trim();
} catch {
  key = rawKey.replace(/^["']|["']$/g, '').trim();
}
if (!/^[a-zA-Z0-9_-]{8,128}$/.test(key)) throw new Error('IndexNow key missing or malformed');

const machineCommerceUrls = [
  `${gateway}?view=docs`,
  `${gateway}?view=llms`,
  `${gateway}?action=catalog`,
  `${gateway}?action=openapi`,
  `${gateway}?action=discover`
];

async function announce(host, keyLocation, urlList) {
  const response = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host, key, keyLocation, urlList })
  });
  if (!response.ok) throw new Error(`IndexNow HTTP ${response.status}: ${await response.text()}`);
  return { host, status: response.status, submitted: urlList.length };
}

const receipts = [
  await announce(
    'evercraft-ai-suite-08c4d2b8.base44.app',
    `${gateway}?action=indexnow-key`,
    machineCommerceUrls
  )
];

const publicOriginRaw = String(process.env.CHUM_PUBLIC_ORIGIN || '').trim().replace(/\/$/, '');
if (publicOriginRaw) {
  const publicOrigin = new URL(publicOriginRaw);
  if (publicOrigin.protocol !== 'https:') throw new Error('CHUM_PUBLIC_ORIGIN must use HTTPS');

  const index = await fetch(new URL('/chum/index.json', publicOrigin)).then(async (response) => {
    if (!response.ok) throw new Error(`CHUM public index HTTP ${response.status}`);
    return response.json();
  });

  const fixedPaths = [
    '/',
    '/chum/',
    '/llms.txt',
    '/llms-full.txt',
    '/ai-discovery.json',
    '/openapi.json',
    '/.well-known/evercraft-discovery.json',
    '/.well-known/evercraft-products.json',
    '/.well-known/evercraft-agent-directory.json',
    '/.well-known/evercraft-machine-catalog.json',
    '/.well-known/evercraft-chum.json'
  ];
  const productPaths = (index.products || [])
    .map((product) => `/chum/products/${encodeURIComponent(String(product.product_key || ''))}/`)
    .filter((pathname) => !pathname.endsWith('//'));
  const publicUrls = Array.from(new Set([...fixedPaths, ...productPaths]))
    .map((pathname) => new URL(pathname, publicOrigin).toString());

  receipts.push(await announce(
    publicOrigin.host,
    `${gateway}?action=indexnow-key`,
    publicUrls
  ));
}

console.log(JSON.stringify({ ok: true, receipts }));
