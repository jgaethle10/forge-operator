import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectRavenTwilio } from './raven-twilio-readonly-inspect.mjs';

const ENV = { TWILIO_ACCOUNT_SID: 'AC' + '1'.repeat(32), TWILIO_AUTH_TOKEN: 'never-print-fixture-secret' };
const inbound = { sid: 'SM' + 'a'.repeat(32), direction: 'inbound', status: 'received',
  from: '+15095550000', to: '+15095672403', body: 'private customer text' };
function fakeTransport(calls, voiceUrl = 'https://raven.example.test/functions/ravenVoiceInbound?private=secret-query') {
  return async (url, options) => {
    calls.push({ url, method: options.method, redirect: options.redirect });
    assert.equal(options.method, 'GET');
    assert.equal(new URL(url).origin, 'https://api.twilio.com');
    if (url.includes('/IncomingPhoneNumbers.json')) return Response.json({ incoming_phone_numbers: [{
      phone_number: '+15095672403',
      voice_url: voiceUrl,
      sms_url: 'https://raven.example.test/functions/secretaryInbound',
      voice_method: 'POST', sms_method: 'POST',
      capabilities: { voice: true, sms: true },
    }] });
    if (url.includes('/Calls.json')) return Response.json({ calls: [
      { sid: 'CA' + 'b'.repeat(32), direction: 'inbound', status: 'completed', from: inbound.from },
      { sid: 'CA' + 'c'.repeat(32), direction: 'outbound', status: 'completed' },
    ] });
    return Response.json({ messages: [inbound] });
  };
}
test('authorized provider inventory is strictly GET and strips contact, message and webhook query PII', async () => {
  const requests = [];
  const receipt = await inspectRavenTwilio({ env: ENV, transport: fakeTransport(requests) });
  assert.equal(requests.length, 3);
  assert.equal(requests.every(x => x.method === 'GET' && x.redirect === 'error'), true);
  assert.equal(receipt.provider_number_found, true);
  assert.equal(receipt.provider_api_auth_confirmed, true);
  assert.equal(receipt.calls.length, 1);
  assert.equal(receipt.messages.length, 1);
  assert.equal(receipt.routing.voice.query_redacted, true);
  assert.equal(receipt.routing.voice.path, '/functions/ravenVoiceInbound');
  const json = JSON.stringify(receipt);
  for (const sensitive of [ENV.TWILIO_AUTH_TOKEN, inbound.from, inbound.body, inbound.sid, 'secret-query']) {
    assert.equal(json.includes(sensitive), false);
  }
  assert.equal(receipt.delivery_verified, false);
  assert.equal(receipt.owner_acknowledged, false);
  assert.equal(receipt.webhook_mutated, false);
});
test('noncanonical webhook path tokens are not printed in inspection output', async () => {
  const secretPath = 'https://alternate.example.test/inbound/private-live-token-12345';
  const receipt = await inspectRavenTwilio({ env: ENV, transport: fakeTransport([], secretPath) });
  assert.equal(receipt.routing.voice.path, '[noncanonical_path_redacted]');
  assert.equal(JSON.stringify(receipt).includes('private-live-token-12345'), false);
});

test('missing credentials fail closed without contacting Twilio', async () => {
  await assert.rejects(inspectRavenTwilio({ env: {}, transport: () => { throw Error('must-not-call'); } }),
    /credentials_unavailable/);
});
test('provider error remains an unavailable read, not a healthy number', async () => {
  const r = await inspectRavenTwilio({ env: ENV, transport: async () => Response.json({ code: 20003 }, { status: 403 }) });
  assert.equal(r.provider_api_auth_confirmed, false);
  assert.equal(r.provider_number_found, false);
  assert.deepEqual(r.http.number, [403, '20003']);
});
