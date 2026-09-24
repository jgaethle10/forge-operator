const gateway = 'https://evercraft-ai-suite-08c4d2b8.base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/machineCommerceGateway';
const keyResponse = await fetch(`${gateway}?action=indexnow-key`);
if (!keyResponse.ok) throw new Error(`IndexNow key endpoint HTTP ${keyResponse.status}`);
const keyBody = await keyResponse.json();
const key = keyBody.key;
if (!key) throw new Error('IndexNow key missing');

const urlList = [
  `${gateway}?view=docs`,
  `${gateway}?view=llms`,
  `${gateway}?action=catalog`,
  `${gateway}?action=openapi`,
  `${gateway}?action=discover`
];

const response = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({
    host: 'evercraft-ai-suite-08c4d2b8.base44.app',
    key,
    keyLocation: `${gateway}?action=indexnow-key`,
    urlList
  })
});
if (!response.ok) throw new Error(`IndexNow HTTP ${response.status}: ${await response.text()}`);
console.log(JSON.stringify({ ok: true, status: response.status, submitted: urlList.length }));
