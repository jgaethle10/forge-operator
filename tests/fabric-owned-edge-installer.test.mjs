import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const script=fs.readFileSync(new URL('../scripts/install-fabric-owned-edge.sh',import.meta.url),'utf8');

test('owned edge installer keeps Fabric private behind the TLS proxy',()=>{
  assert.match(script,/--host 127\.0\.0\.1 --port \$FABRIC_PORT/);
  assert.match(script,/reverse_proxy 127\.0\.0\.1:8787/);
  assert.doesNotMatch(script,/--host 0\.0\.0\.0 --port 8787/);
});

test('owned edge installer maps ChromeOS-safe high ports for public 80 and 443',()=>{
  assert.match(script,/HTTP_PORT="18080"/);
  assert.match(script,/HTTPS_PORT="8443"/);
  assert.match(script,/http_port 18080/);
  assert.match(script,/https_port 8443/);
});

test('owned edge installer persists Fabric and TLS edge under systemd',()=>{
  assert.match(script,/evercraft-fabric\.service/);
  assert.match(script,/evercraft-public-edge\.service/);
  assert.match(script,/Restart=always/);
  assert.match(script,/systemctl enable --now evercraft-fabric\.service/);
  assert.match(script,/systemctl enable --now evercraft-public-edge\.service/);
});

test('OpenAI verification token helper is secret-prompted and validated',()=>{
  assert.match(script,/read -r -s -p "Paste OpenAI domain verification token/);
  assert.match(script,/\[A-Za-z0-9_-\]\{16,512\}/);
  assert.match(script,/chmod 0600/);
});
