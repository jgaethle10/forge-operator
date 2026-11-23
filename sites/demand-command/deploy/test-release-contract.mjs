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


test('Demand SSH listener is isolated, key-only, and remote-forwards to one loopback port',()=>{
  const sshd=read('./sshd-demand-relay.conf.example');
  assert.match(sshd,/^Port 8222$/m);
  assert.match(sshd,/^AllowUsers demandrelay$/m);
  assert.match(sshd,/^AuthenticationMethods publickey$/m);
  assert.match(sshd,/^PasswordAuthentication no$/m);
  assert.match(sshd,/^KbdInteractiveAuthentication no$/m);
  assert.match(sshd,/^PermitRootLogin no$/m);
  assert.match(sshd,/^AllowTcpForwarding remote$/m);
  assert.ok(sshd.split('\n').includes('PermitListen 127.0.0.1:18897'));
  assert.match(sshd,/^GatewayPorts no$/m);
  assert.match(sshd,/^MaxSessions 0$/m);
  assert.doesNotMatch(sshd,/^Port 22$/m);
  assert.doesNotMatch(sshd,/^PasswordAuthentication yes$/m);
  assert.doesNotMatch(sshd,/^AllowTcpForwarding yes$/m);
  assert.ok(!sshd.split('\n').some(line=>line.startsWith('HostKey /etc/ssh/ssh_host_')));
});

test('Penguin relay installer is key-fingerprint-gated and does not alter normal SSH/Fabric',()=>{
  const script=read('./install-penguin-demand-relay.sh');
  assert.match(script,/--expected-fingerprint/);
  assert.match(script,/ssh-keygen -lf "\$PUBLIC_FILE" -E sha256/);
  assert.match(script,/if \[\[ "\$ACTUAL_FINGERPRINT" != "\$EXPECTED_FINGERPRINT" \]\]/);
  assert.match(script,/--public-key-file/);
  assert.match(script,/\buseradd --system/);
  assert.match(script,/ssh-keygen -q -t ed25519/);
  assert.match(script,/sshd -t -f "\$CONFIG"/);
  assert.match(script,/systemctl enable --now "\$SERVICE"/);
  assert.match(script,/MaxSessions|restrict,port-forwarding/);
  assert.doesNotMatch(script,/systemctl (?:stop|restart|enable|disable)\s+(?:ssh|sshd|evercraft-public-edge|evercraft-fabric)(?:[.\s]|$)/);
  assert.doesNotMatch(script,/sshd_not_to_be_run/);
});

test('NextGen tunnel refuses unpinned SSH and only forwards private Demand port',()=>{
  const tunnel=read('./install-nextgen-demand-tunnel.sh');
  assert.match(tunnel,/EXPECTED_FINGERPRINT='SHA256:NVPAF3rqN9wjkR10o0EvB7aI\/PBFaYj17dfDYvI\+\+Ck'/);
  assert.match(tunnel,/--verify/);
  assert.match(tunnel,/--install/);
  assert.match(tunnel,/for attempt in 1 2 3 4/);
  assert.match(tunnel,/\$SCAN" -T 25 -p 8222 -t ed25519/);
  assert.match(tunnel,/validate_ssh_keyscan\\.py/);
  assert.match(tunnel,/SCAN_VALIDATED=true/);
  assert.match(tunnel,/if \\[\\[ "\\$RESULT" -ne 3 \\]\\]/);
  assert.match(tunnel,/SSH keyscan contained unexpected or conflicting identity data/);
  assert.match(tunnel,/StrictHostKeyChecking=yes/);
  assert.match(tunnel,/UserKnownHostsFile=\$KNOWN/);
  assert.match(tunnel,/ExitOnForwardFailure=yes/);
  assert.match(tunnel,/BatchMode=yes/);
  assert.match(tunnel,/-R 127\.0\.0\.1:18897:127\.0\.0\.1:18896/);
  assert.match(tunnel,/systemctl --user enable/);
  assert.match(tunnel,/cmp -s "\$TEMP" "\$KNOWN"/);
  assert.doesNotMatch(tunnel,/StrictHostKeyChecking=no/);
  assert.doesNotMatch(tunnel,/sshpass|base44|cloudflared|ngrok/i);
});
