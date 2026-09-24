const host = 'findmypart.base44.app';
const keyLocation =
  process.env.CHUM_INDEXNOW_KEY_LOCATION ||
  'https://findmypart.base44.app/functions/indexNowKey';
const key =
  String(process.env.CHUM_INDEXNOW_KEY || '9f7c2a4e8b1d6f3a5c0e7b9d2f4a6c8e').trim();

if (!/^[a-zA-Z0-9_-]{8,128}$/.test(key)) {
  throw new Error('IndexNow key missing or malformed');
}

const urlList = [
  'https://findmypart.base44.app/functions/evercraftCapabilityDiscoveryMcp',
  'https://findmypart.base44.app/functions/evercraftMachineCommerceMcp',
  'https://findmypart.base44.app/functions/evercraftCapabilityA2A',
  'https://findmypart.base44.app/functions/evercraftUniversalAgentGateway'
];

const verify = await fetch(keyLocation, {
  headers: { 'user-agent': 'Evercraft-CHUM/0.4 (+indexnow-key-check)' }
});
if (!verify.ok) {
  throw new Error(`IndexNow key location HTTP ${verify.status}`);
}
const publishedKey = (await verify.text()).trim();
if (publishedKey !== key) {
  throw new Error('IndexNow key location does not match configured key');
}

const response = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'user-agent': 'Evercraft-CHUM/0.4 (+indexnow-announce)'
  },
  body: JSON.stringify({
    host,
    key,
    keyLocation,
    urlList
  })
});

if (!response.ok) {
  throw new Error(`IndexNow HTTP ${response.status}: ${await response.text()}`);
}

console.log(
  JSON.stringify({
    ok: true,
    status: response.status,
    host,
    key_location_verified: true,
    submitted: urlList.length,
    urls: urlList
  })
);
