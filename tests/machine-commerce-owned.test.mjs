import assert from 'node:assert/strict';
import fs from 'node:fs';

const server=fs.readFileSync('server.ts','utf8');
for(const route of [
  '/api/machine-commerce/health',
  '/api/machine-commerce',
  '/api/machine-commerce/route'
]){
  assert.ok(server.includes(route),'missing owned Machine Commerce route '+route);
}
assert.ok(server.includes('base44_fallback_allowed: false'));
assert.ok(server.includes("transactional_state: 'migration_hold'"));

const registry=JSON.parse(fs.readFileSync('registry/catalog.json','utf8'));
const front=registry.universal_front_door||{};
assert.equal(front.mcp,null);
assert.equal(front.http_gateway,'/api/machine-commerce');
assert.equal(front.health,'/api/machine-commerce/health');
assert.equal(front.route,'/api/machine-commerce/route');
assert.equal(front.runtime,'forge-operator-owned');
assert.equal(front.transactional_state,'migration_hold');
assert.equal(front.base44_fallback_allowed,false);

for(const file of ['server.ts','systemia/chum/start-corridor.mjs','systemia/chum/build-public-mirror.mjs']){
  const body=fs.readFileSync(file,'utf8');
  assert.equal(/base44\.app/i.test(body),false,file+' still contains a Base44 host');
}

console.log(JSON.stringify({
  ok:true,
  owned_machine_commerce_gateway:true,
  transactional_state:'migration_hold',
  base44_fallback_allowed:false
}));
