import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

const script=fs.readFileSync(new URL('../scripts/install-fabric-relay-account.sh',import.meta.url),'utf8');

test('relay enrollment disables interactive access while allowing only bounded remote forwarding',()=>{
  assert.match(script,/AuthenticationMethods publickey/);
  assert.match(script,/PasswordAuthentication no/);
  assert.match(script,/KbdInteractiveAuthentication no/);
  assert.match(script,/AllowTcpForwarding remote/);
  assert.match(script,/GatewayPorts no/);
  assert.match(script,/PermitListen 127\.0\.0\.1:\$TUNNEL_PORT/);
  assert.match(script,/PermitTTY no/);
  assert.match(script,/AllowAgentForwarding no/);
  assert.match(script,/MaxSessions 0/);
  assert.match(script,/command=\\\"\/usr\/bin\/false\\\"/);
});

test('relay enrollment pins one authorized public key and records only its fingerprint',()=>{
  assert.match(script,/authorized_keys/);
  assert.match(script,/ssh-keygen -lf "\$PUBLIC_KEY_FILE" -E sha256/);
  assert.match(script,/public_key_fingerprint/);
  assert.match(script,/secret_material_exposed/);
  assert.doesNotMatch(script,/PRIVATE KEY|BEGIN OPENSSH PRIVATE KEY/);
});

test('relay sshd changes are validated before reload',()=>{
  assert.match(script,/sshd -t -f \/etc\/ssh\/sshd_config/);
  assert.match(script,/systemctl reload ssh\.service/);
});

test('relay enrollment shell is syntactically valid',()=>{
  execFileSync('bash',['-n',new URL('../scripts/install-fabric-relay-account.sh',import.meta.url).pathname],{stdio:'pipe'});
});
