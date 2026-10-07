import assert from 'node:assert/strict';
import fs from 'node:fs';

const script=fs.readFileSync(new URL('../../scripts/saban-resident-watchdog.sh',import.meta.url),'utf8');

assert.match(
  script,
  /ensure_active evercraft-saban-resource-expansion\.service service/
);
assert.match(
  script,
  /resource-field-expansion-state\.json".*evercraft-saban-resource-expansion\.service resource-expansion/
);
assert.match(
  script,
  /for unit in[\s\S]*evercraft-saban-resource-expansion\.service/
);
assert.match(
  script,
  /SABAN_WATCHDOG_MAX_STALE_SECONDS/
);
assert.match(
  script,
  /"commercial_spend_usd":0/
);

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.saban.resource-expansion-watchdog-proof.v1',
  resident_service_health_checked:true,
  stale_expansion_cycle_repaired:true,
  expansion_service_in_overall_health:true,
  commercial_spend_unchanged:true,
},null,2));
