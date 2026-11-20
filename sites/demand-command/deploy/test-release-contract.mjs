import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = name => fs.readFileSync(new URL(name, import.meta.url),'utf8');
const unit=read('./install-nextgen-resident.sh');
const edge=read('./Caddyfile.demand.example');
const readme=read('./README.md');
test('installer is explicit, user-scoped, loopback and never touches public edge', () => {
  assert.match(unit,/--install/);
  assert.match(unit,/systemctl --user/);
  assert.match(unit,/127\.0\.0\.1:18896/);
  assert.match(unit,/UMask=0077/);
  assert.match(unit,/EnvironmentFile=\$ENVFILE/);
  assert.match(unit,/if \[\[ -L "\$ENVFILE" \|\| -L "\$UNIT" \]\]/);
  assert.doesNotMatch(unit,/systemctl (?:restart|stop|disable) evercraft-(?:fabric|public-edge|router-map)/);
  assert.doesNotMatch(unit,/cloudflared|ngrok|base44|wix|digitalocean/i);
});
test('public edge is an inert placeholder requiring two auth gates and reverse tunnel', () => {
  assert.match(edge,/demand\.systemiacommandcenters\.com/);
  assert.match(edge,/basic_auth/);
  assert.match(edge,/REPLACE_WITH_LOCAL_CADDY_BCRYPT_HASH/);
  assert.match(edge,/reverse_proxy 127\.0\.0\.1:18897/);
  assert.match(edge,/Cache-Control "private, no-store"/);
  assert.match(edge,/noindex, nofollow/);
  assert.doesNotMatch(edge,/reverse_proxy 127\.0\.0\.1:18896/);
});
test('deployment notes distinguish intended target from verified live URL',()=>{
  assert.match(readme,/NOT LIVE/);
  assert.match(readme,/not a public multiuser CRM|does not publish an HTTPS link|never opens a WAN port/i);
  assert.match(readme,/no verified|no.*proof|Stop conditions/i);
  assert.match(readme,/NextGen/);
  assert.match(readme,/Penguin/);
});
