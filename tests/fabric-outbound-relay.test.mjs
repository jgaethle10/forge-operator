import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const client=fs.readFileSync(new URL('../scripts/install-fabric-outbound-relay.sh',import.meta.url),'utf8');
const relay=fs.readFileSync(new URL('../scripts/install-fabric-relay-node.sh',import.meta.url),'utf8');

test('outbound relay is reverse-only, loopback-bound, and fail-closed',()=>{
  assert.match(client,/-R "127\.0\.0\.1:\$EVERCRAFT_RELAY_REMOTE_PORT:127\.0\.0\.1:\$EVERCRAFT_RELAY_LOCAL_PORT"/);
  assert.match(client,/ExitOnForwardFailure=yes/);
  assert.match(client,/BatchMode=yes/);
  assert.match(client,/StrictHostKeyChecking=yes/);
  assert.match(client,/UserKnownHostsFile=/);
  assert.match(client,/IdentitiesOnly=yes/);
  assert.doesNotMatch(client,/-R "0\.0\.0\.0:/);
});

test('relay client remains resident and does not expose an inbound admin listener',()=>{
  assert.match(client,/evercraft-fabric-outbound-relay\.service/);
  assert.match(client,/Restart=always/);
  assert.match(client,/NoNewPrivileges=true/);
  assert.doesNotMatch(client,/ListenStream|sshd_config|PasswordAuthentication yes/);
});

test('public relay terminates HTTPS into a loopback-only tunnel socket',()=>{
  assert.match(relay,/reverse_proxy 127\.0\.0\.1:\$TUNNEL_PORT/);
  assert.match(relay,/GatewayPorts no/);
  assert.match(relay,/PermitListen 127\.0\.0\.1:\$TUNNEL_PORT/);
  assert.doesNotMatch(relay,/reverse_proxy 0\.0\.0\.0/);
});
