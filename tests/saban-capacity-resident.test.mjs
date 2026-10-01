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
  assert.match(doctor,/saban_capacity_repair_failed/);
});
