import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from './worker.mjs';

const request = (path='/', init={}) => new Request('https://voteroman.com' + path, init);

test('serves independent, embedded campaign page and original donation link', async () => {
  const resp = await handleRequest(request(), { fetcher: () => { throw Error('unexpected network'); } });
  assert.equal(resp.status, 200);
  assert.equal(resp.headers.get('x-evercraft-shell-source'), 'embedded');
  const html = await resp.text();
  assert.match(html, /Roman Kilinkaridis/);
  assert.match(html, /https:\/\/donate\.voteroman\.com\//);
  assert.doesNotMatch(html, /\[APP UNAVAILABLE\]/);
});
test('HEAD returns no HTML body and keeps the independent host', async () => {
  const resp = await handleRequest(request('/events', { method: 'HEAD' }));
  assert.equal(resp.status, 200);
  assert.equal(await resp.text(), '');
});
test('does not hijack the donation subdomain', async () => {
  const resp = await handleRequest(new Request('https://donate.voteroman.com/'));
  assert.equal(resp.status, 421);
});
test('routes typed donation shortcut to the unchanged provider', async () => {
  const resp = await handleRequest(request('/donate'));
  assert.equal(resp.status, 302);
  assert.equal(resp.headers.get('location'), 'https://donate.voteroman.com/');
});
test('cannot act as an open proxy or write to campaign systems', async () => {
  assert.equal((await handleRequest(request('/api/users'))).status, 404);
  assert.equal((await handleRequest(request('/', { method: 'POST' }))).status, 405);
  assert.equal((await handleRequest(new Request('https://attacker.example/'))).status, 421);
});
test('remote mirror is used only if verified', async () => {
  const html = '<!doctype html><html>' + 'Roman Kilinkaridis https://donate.voteroman.com/'.padEnd(5100, 'x') + '</html>';
  const resp = await handleRequest(request(), { env: { USE_REMOTE_MIRROR: 'true' }, fetcher: async () => new Response(html, { headers: { 'content-type': 'text/html' } }) });
  assert.equal(resp.headers.get('x-evercraft-shell-source'), 'verified-remote-mirror');
});
test('remote mirror 402 or outage falls back, never leaks hosting error', async () => {
  const resp = await handleRequest(request('/positions'), { env: { USE_REMOTE_MIRROR: 'true' }, fetcher: async () => new Response('[APP UNAVAILABLE]', { status: 402 }) });
  assert.equal(resp.status, 200);
  assert.equal(resp.headers.get('x-evercraft-shell-source'), 'embedded');
});
test('preview host must be explicitly authorized', async () => {
  const url = new Request('https://roman-shield.example.workers.dev/');
  assert.equal((await handleRequest(url)).status, 421);
  assert.equal((await handleRequest(url, { env: { PREVIEW_HOSTS: 'roman-shield.example.workers.dev' } })).status, 200);
});
test('health endpoint does not claim domain control', async () => {
  const resp = await handleRequest(request('/_evercraft/health'));
  const json = await resp.json();
  assert.equal(json.base44_dependency, false);
  assert.equal(json.registrar_control_verified, false);
});
