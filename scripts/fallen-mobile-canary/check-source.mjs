import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile(new URL('../../systemia/media-studio/hosted-mobile/rc102.staging.json', import.meta.url), 'utf8'));
const response = await fetch(manifest.site_url, {
  signal: AbortSignal.timeout(30000),
  headers: { 'user-agent': 'Evercraft-Fallen-QA/1.0 (read-only release verification)' },
});
assert.equal(response.status, 200, 'HTTPS site must respond HTTP 200');
assert.equal(new URL(response.url).origin, new URL(manifest.site_url).origin, 'must not leave the declared host');
assert.match(response.headers.get('content-type') ?? '', /text\/html/i, 'response must be HTML');
const served = Buffer.from(await response.arrayBuffer());
const original = served.toString('utf8');
const injection = /<script\s+id="wix-site-script"\s+src="https:\/\/manage\.wix\.com\/_api\/headless-business-setup\/v1\/headless-business\/site-script\.js"\s+data-client-id="[a-z0-9-]+"\s+async><\/script>/g;
const matches = [...original.matchAll(injection)];
assert.equal(matches.length, 1, 'expected exactly one known Wix head injection; unknown delivery drift is a release hold');
const cleaned = original.replace(injection, '');
const source = Buffer.from(cleaned, 'utf8');
const sha256 = createHash('sha256').update(source).digest('hex');
assert.equal(source.byteLength, manifest.source_bytes, 'hosted source byte length differs');
assert.equal(sha256, manifest.source_sha256, 'hosted source digest differs');
assert.equal(served.byteLength - source.byteLength, manifest.known_host_injection.expected_added_bytes, 'host-injection byte count differs');
for (const marker of ['RC 1.0.2 Mobile Director', 'id="mobilePlay"', 'id="mobilePreview"', 'id="mobileEdit"', 'id="mobileScene"', 'id="mobileBeats"']) {
  assert.ok(cleaned.includes(marker), 'required director control missing: ' + marker);
}
console.log(JSON.stringify({
  schema: 'evercraft.fallen.hosted-source-canary.v1',
  status: 'passed',
  stage: manifest.status,
  url: manifest.site_url,
  status_code: response.status,
  served_bytes: served.byteLength,
  recovered_source_bytes: source.byteLength,
  stripped_known_host_script_bytes: served.byteLength - source.byteLength,
  source_sha256: sha256,
  runtime_execution_claim: false,
  device_safari_claim: false
}, null, 2));
