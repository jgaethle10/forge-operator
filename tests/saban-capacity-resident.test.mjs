import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const installer=fs.readFileSync(new URL('../scripts/install-saban-capacity-organism.sh',import.meta.url),'utf8');
const doctor=fs.readFileSync(new URL('../scripts/fabric-edge-doctor.sh',import.meta.url),'utf8');

test('resident Saban capacity organism is zero-spend and unprivileged',()=>{
  assert.match(installer,/User=\$RUN_USER/);
  assert.match(installer,/NoNewPrivileges=true/);
  assert.match(installer,/ProtectSystem=full/);
  assert.match(installer,/SABAN_ALLOW_COMMERCIAL_CAPACITY=0/);
  assert.match(installer,/capacity-organism\.mjs --once/);
  assert.match(installer,/microseed-gateway-runner\.mjs/);
  assert.match(installer,/microseed-probation-organism\.mjs/);
  assert.match(installer,/evercraft-saban-probation\.timer/);
  assert.match(installer,/ambient-job-dispatcher\.mjs/);
  assert.match(installer,/evercraft-saban-dispatch\.timer/);
  assert.match(installer,/evercraft-saban-watchdog\.timer/);
  assert.match(installer,/saban-resident-watchdog\.sh/);
  assert.match(installer,/ambient-work-api-runner\.mjs/);
  assert.match(installer,/evercraft-saban-work-api\.service/);
  assert.match(installer,/ambient-work-api-token/);
  assert.match(installer,/pairing-api-token/);
  assert.match(installer,/microseed-pairing-api-runner\.mjs/);
  assert.match(installer,/evercraft-saban-pairing-api\.service/);
  assert.match(installer,/--host 127\.0\.0\.1 --port 8794/);
  assert.match(installer,/--host 127\.0\.0\.1 --port 8791/);
  assert.match(installer,/microseed-gateway-token/);
  assert.match(installer,/\.secrets\/device-tokens/);
  assert.match(installer,/OnUnitActiveSec=\$CADENCE/);
});

test('resident installer explicitly denies auto authorization and paid leasing',()=>{
  assert.match(installer,/does NOT:/i);
  assert.match(installer,/authorize observed devices/);
  assert.match(installer,/commercial market orders or paid leases/);
});

test('Chromebook edge doctor installs and revives Saban capacity organism',()=>{
  assert.match(doctor,/ensure_saban_capacity_timer/);
  assert.match(doctor,/install-saban-capacity-organism\.sh/);
  assert.match(doctor,/evercraft-saban-capacity\.timer/);
  assert.match(doctor,/evercraft-saban-microseed-gateway\.service/);
  assert.match(doctor,/evercraft-saban-probation\.timer/);
  assert.match(doctor,/evercraft-saban-dispatch\.timer/);
  assert.match(doctor,/evercraft-saban-work-api\.service/);
  assert.match(doctor,/evercraft-saban-pairing-api\.service/);
  assert.match(doctor,/evercraft-saban-watchdog\.timer/);
  assert.match(doctor,/saban_capacity_repair_ok/);
  assert.match(doctor,/saban_capacity_repair_code/);
  assert.match(doctor,/saban_capacity_degraded/);
});
