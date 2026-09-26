import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isNonPublicIp,
  normalizePublicHttpUrl,
  sanitizeJob
} from './policy.mjs';

test('rejects private, loopback, link-local, reserved and documentation IPs', () => {
  for (const ip of [
    '127.0.0.1',
    '10.0.0.1',
    '172.16.0.1',
    '192.168.1.2',
    '169.254.169.254',
    '100.64.0.1',
    '192.0.2.1',
    '198.51.100.10',
    '203.0.113.10',
    '::1',
    'fc00::1',
    'fe80::1',
    'ff02::1',
    '2001:db8::1',
    '::ffff:127.0.0.1'
  ]) {
    assert.equal(isNonPublicIp(ip), true, ip);
  }
  assert.equal(isNonPublicIp('8.8.8.8'), false);
  assert.equal(isNonPublicIp('1.1.1.1'), false);
});

test('rejects credential-bearing and non-http URLs', () => {
  assert.throws(() => normalizePublicHttpUrl('file:///etc/passwd'), /unsupported_url_scheme/);
  assert.throws(() => normalizePublicHttpUrl('https://user:pass@example.com/'), /embedded_credentials_not_allowed/);
  assert.throws(() => normalizePublicHttpUrl('https://example.com:8443/'), /unsupported_port/);
  assert.equal(normalizePublicHttpUrl('https://example.com/path?q=1').hostname, 'example.com');
});

test('only admits bounded read-only browser actions', () => {
  const job = sanitizeJob({
    url:'https://example.com',
    actions:[
      {type:'wait',ms:99999},
      {type:'scroll',y:99999},
      {type:'follow_anchor',selector:'a.more'},
      {type:'wait_for_selector',selector:'main'}
    ],
    viewport:{width:99999,height:1}
  });
  assert.equal(job.actions[0].ms, 2000);
  assert.equal(job.actions[1].y, 4000);
  assert.equal(job.viewport.width, 1920);
  assert.equal(job.viewport.height, 240);
  assert.throws(() => sanitizeJob({url:'https://example.com',actions:[{type:'click',selector:'button'}]}), /unsupported_action/);
  assert.throws(() => sanitizeJob({url:'https://example.com',actions:Array.from({length:9},()=>({type:'wait'}))}), /too_many_actions/);
});
