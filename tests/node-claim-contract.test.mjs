import assert from 'node:assert/strict';
import fs from 'node:fs';

const install=fs.readFileSync(new URL('../systemia/compute/install-node-seed.sh',import.meta.url),'utf8');
const bootstrap=fs.readFileSync(new URL('../systemia/compute/node-self-bootstrap.mjs',import.meta.url),'utf8');
const remoteService=fs.readFileSync(new URL('../systemia/compute/remote-admission-service.mjs',import.meta.url),'utf8');
const userInstall=fs.readFileSync(new URL('../systemia/compute/install-local-organism-user.sh',import.meta.url),'utf8');

assert.match(install,/NODE_ROLE=.*public_edge/);
assert.match(install,/private_worker/);
assert.match(install,/BIND_HOST=.*127\.0\.0\.1/);
assert.match(install,/ExecStart=.*node-seed\.mjs.*--host \$\{BIND_HOST\}/);
assert.match(install,/evercraft-remote-admission\.service/);
assert.match(install,/ExecCondition=.*EVERCRAFT_REMOTE_BROKER_URL/);
assert.match(install,/remote_admission_service/);
assert.match(install,/outbound_only/);

assert.match(bootstrap,/nodeRole='public_edge'/);
assert.match(bootstrap,/private_worker/);
assert.match(bootstrap,/outbound_admission_service_installed/);
assert.match(bootstrap,/setEnvValue\(envFile,'EVERCRAFT_REMOTE_BROKER_URL'/);
assert.match(bootstrap,/systemctl'.*'enable'.*'--now'.*'evercraft-remote-admission\.service'/s);
assert.match(bootstrap,/remote_broker_requires_https_or_loopback_proof/);

assert.match(remoteService,/RemoteAdmissionKeeper/);
assert.match(remoteService,/allocator_token_exposed:false/);
assert.match(remoteService,/allocator_token_persisted_in_receipt:false/);
assert.match(remoteService,/local_compute_scope:'loopback_only'/);
assert.match(remoteService,/remote-admission-status\.json/);

assert.match(userInstall,/EVERCRAFT_REMOTE_OPERATOR_ENABLED=true\$/);
assert.doesNotMatch(userInstall,/EVERCRAFT_REMOTE_OPERATOR_ENABLED=true\necho/);

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.compute.node-claim-contract.v1',
  private_worker_loopback_only:true,
  persistent_outbound_admission:true,
  broker_url_https_guard:true,
  allocator_secret_not_in_status_receipts:true,
  user_mode_installer_guard_valid:true
},null,2));
