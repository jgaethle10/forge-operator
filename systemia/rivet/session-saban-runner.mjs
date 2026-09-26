import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const inventoryPath='artifacts/rivet-session-sprawl/saban-jobs.json';
const registryPath='systemia/saban/multiplication-registry.json';

function run(args){
  const result=spawnSync(process.execPath,args,{stdio:'inherit',env:process.env});
  if(result.status!==0)process.exit(result.status??1);
}

run(['systemia/rivet/session-saban-inventory.mjs']);

const inventory=JSON.parse(fs.readFileSync(inventoryPath,'utf8'));
const registry=JSON.parse(fs.readFileSync(registryPath,'utf8'));
const contract=(registry.software||[]).find(item=>item.software_id==='rivet-session-sprawl');
if(!contract)throw new Error('RIVET session-sprawl Saban contract missing');

const workItems=Array.isArray(inventory.jobs)?inventory.jobs.length:0;
const roles=Array.isArray(contract.roles)?contract.roles.length:0;
if(!workItems||!roles)throw new Error('RIVET session-sprawl inventory or roles empty');

const requested=workItems*roles;
const maxAgents=Number(contract.max_logical_agents||10000);
if(requested>maxAgents){
  throw new Error('Complete role-item coverage requires '+requested+' logical agents, above contract max '+maxAgents);
}
const workers=Math.max(1,Math.min(Number(contract.default_physical_workers||12),Number(contract.max_physical_workers||32),requested));

console.log(JSON.stringify({
  schema:'evercraft.rivet.session-saban-run.v1',
  work_items:workItems,
  roles,
  logical_agents:requested,
  physical_workers:workers,
  coverage:'complete_role_item_cartesian_pass'
}));

run([
  'systemia/saban/multiplier.mjs',
  '--software','rivet-session-sprawl',
  '--inventory',inventoryPath,
  '--agents',String(requested),
  '--workers',String(workers),
  '--execute',
  '--reconcile'
]);
