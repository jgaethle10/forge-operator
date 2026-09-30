import fs from 'node:fs';

const artifactsDir = 'artifacts/chum';
fs.mkdirSync(artifactsDir, { recursive: true });

const originRaw = String(process.env.CHUM_PUBLIC_ORIGIN || '').trim();
const key = String(process.env.CHUM_INDEXNOW_KEY || '').trim();
const explicitKeyLocation = String(process.env.CHUM_INDEXNOW_KEY_LOCATION || '').trim();

const receipt = {
  schema: 'evercraft.chum.indexnow.v3',
  generated_at: new Date().toISOString(),
  runtime: 'owned_public_origin_only',
  public_origin: originRaw || null,
  status: 'started',
  submitted: 0,
  urls: [],
  preflight_failed: [],
  external_action_taken: false
};

function writeReceipt() {
  fs.writeFileSync(artifactsDir + '/indexnow-latest.json', JSON.stringify(receipt, null, 2) + '\n');
  fs.writeFileSync(
    artifactsDir + '/indexnow-latest.md',
    [
      '# CHUM Freshness Broadcast Receipt',
      '',
      'Generated: ' + receipt.generated_at,
      'Status: ' + receipt.status,
      'Owned public origin: ' + (receipt.public_origin || 'unconfigured'),
      'Submitted URLs: ' + receipt.submitted,
      receipt.http_status ? 'IndexNow HTTP: ' + receipt.http_status : null,
      receipt.reason ? 'Reason: ' + receipt.reason : null,
      receipt.error ? 'Error: ' + receipt.error : null,
      '',
      ...(receipt.urls.length ? ['## Submitted surfaces', '', ...receipt.urls.map((url) => '- ' + url), ''] : []),
      ...(receipt.preflight_failed.length ? [
        '## Preflight failures',
        '',
        ...receipt.preflight_failed.map((row) => '- ' + row.url + ': HTTP ' + (row.status || 0) + (row.error ? ' ' + row.error : '')),
        ''
      ] : [])
    ].filter((value) => value !== null).join('\n')
  );
}

function ownedOrigin(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:') return null;
    if (host === 'base44.app' || host.endsWith('.base44.app')) return null;
    return url.origin;
  } catch {
    return null;
  }
}

const origin = ownedOrigin(originRaw);
if (!origin) {
  receipt.status = 'held';
  receipt.reason = 'owned_chum_public_origin_unconfigured';
  writeReceipt();
  console.log(JSON.stringify({ ok: true, held: true, reason: receipt.reason }));
  process.exit(0);
}

if (!/^[a-zA-Z0-9_-]{8,128}$/.test(key)) {
  receipt.status = 'held';
  receipt.reason = 'owned_indexnow_key_unconfigured';
  writeReceipt();
  console.log(JSON.stringify({ ok: true, held: true, reason: receipt.reason }));
  process.exit(0);
}

const paths = [
  '/',
  '/llms.txt',
  '/ai-discovery.json',
  '/.well-known/evercraft-products.json',
  '/.well-known/evercraft-machine-catalog.json',
  '/.well-known/evercraft-pain-index.json',
  '/.well-known/evercraft-agent-directory.json',
  '/chum/',
  '/chum/capabilities.json',
  '/chum/answers/index.json',
  '/chum/sitemaps/index.xml',
  '/chum/commercial/',
  '/chum/commercial/feed.json'
];

const candidates = [...new Set(paths.map((pathname) => new URL(pathname, origin).toString()))];
const checked = await Promise.all(candidates.map(async (url) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'user-agent': 'Evercraft-CHUM/0.5 (+owned-indexnow-preflight)',
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

const urlList = checked.filter((row) => row.ok).map((row) => row.url);
receipt.preflight_failed = checked.filter((row) => !row.ok);
receipt.urls = urlList;

if (!urlList.length) {
  receipt.status = 'held';
  receipt.reason = 'no_healthy_owned_public_urls';
  writeReceipt();
  console.log(JSON.stringify({ ok: true, held: true, reason: receipt.reason }));
  process.exit(0);
}

const keyLocationCandidate = ownedOrigin(explicitKeyLocation)
  ? explicitKeyLocation
  : new URL('/' + key + '.txt', origin).toString();

try {
  const response = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host: new URL(origin).hostname,
      key,
      keyLocation: keyLocationCandidate,
      urlList
    })
  });
  receipt.http_status = response.status;
  receipt.submitted = urlList.length;
  receipt.external_action_taken = true;
  if (!response.ok) {
    throw new Error('IndexNow HTTP ' + response.status + ': ' + await response.text());
  }
  receipt.status = 'accepted';
  writeReceipt();
  console.log(JSON.stringify({
    ok: true,
    status: response.status,
    submitted: urlList.length,
    preflight_failed: receipt.preflight_failed.length
  }));
} catch (error) {
  receipt.status = 'failed';
  receipt.error = error instanceof Error ? error.message : String(error);
  writeReceipt();
  throw error;
}
