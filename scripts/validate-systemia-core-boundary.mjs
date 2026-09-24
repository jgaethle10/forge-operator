import fs from 'node:fs';

const contractPath='systemia/core/public-handoff.json';
const fail=(message)=>{ throw new Error('SYSTEMIA_CORE_PUBLIC_BOUNDARY_FAIL: '+message); };
const assert=(condition,message)=>{ if(!condition) fail(message); };

assert(fs.existsSync(contractPath),'public handoff contract missing');
const contract=JSON.parse(fs.readFileSync(contractPath,'utf8'));

assert(contract.schema==='evercraft.systemia.core.public-handoff.v1','schema mismatch');
assert(contract.identity?.systemia_core==='private_internal_control_plane','Systemia Core must remain private');
assert(contract.identity?.systemia_marketing_agency==='separate_public_marketing_product','Marketing Agency identity boundary missing');
assert(contract.identity?.forge_operator==='public_yard_and_release_bridge','Forge must remain a public handoff bridge');
assert(contract.repository_boundary?.this_repository==='public','Forge repository visibility contract must be public');
assert(contract.repository_boundary?.contains_systemia_core_source===false,'Forge must never claim to contain private Core source');
assert(contract.repository_boundary?.private_core_repository_required===true,'private Core repository requirement missing');
assert(contract.repository_boundary?.private_core_repository_state==='provisioning_required','unexpected private Core repository state');
assert(Array.isArray(contract.release_path)&&contract.release_path.includes('yard_operator'),'Yard Operator missing from release path');
assert(Array.isArray(contract.release_path)&&contract.release_path.includes('deployment_receipt'),'deployment receipt missing from release path');

const json=JSON.stringify(contract);
for(const forbiddenKey of ['app_id','workspace_id','access_token','refresh_token','api_key','password','cookie','session_secret']){
  assert(!new RegExp('"' + forbiddenKey + '"\\s*:','i').test(json),'private key leaked into public handoff: '+forbiddenKey);
}

for(const gate of [
  'ci_pass',
  'immutable_release_ref',
  'runtime_admission_pass',
  'health_pass',
  'route_verification_pass',
  'rollback_target_present'
]){
  assert(contract.required_gates?.includes(gate),'required release gate missing: '+gate);
}

console.log('SYSTEMIA_CORE_PUBLIC_BOUNDARY_PASS',JSON.stringify({
  private_core_source:true,
  public_forge_handoff:true,
  marketing_identity_separate:true,
  yard_release_path:true,
  deployment_receipt_required:true
}));
