import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, symlinkSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {inspectLocalMicroSeedInventory} from './microseed-local-inventory.mjs';
import {normalizeMicroDeviceManifest} from './microseed-device-bridge.mjs';

function fixture(fn){
 const home=mkdtempSync(join(tmpdir(),'evercraft-microseed-inventory-'));
 try{return fn(home)}finally{rmSync(home,{recursive:true,force:true})}
}
function manifest(){
 return normalizeMicroDeviceManifest({
  device_id:'synthetic-node-identity',device_class:'linux-test',bridge_mode:'native_agent',
  authorization_ref:'synthetic-approval',endpoint:'http://127.0.0.1:8792',
  supported_workloads:['systemia.content-hash.v1'],
  resources:{cpu_units:1,memory_mb:512,storage_gb:1},
  attestation:{mode:'device',device_identity:'synthetic-key',receipt_signing_required:true,
    receipt_public_key_pem:'synthetic-public-material',receipt_key_id:'synthetic-signer'},
 });
}
const systemctl=(cmd,args)=>({status:0,stdout:
 'evercraft-autonomy-broker.service loaded active running broker\n'+
 'evercraft-microseed-native.service loaded inactive dead MicroSeed\n'+
 'evercraft-saban.service loaded active running Saban\n'});

test('absent bootstrap is honestly missing without installs or false live claims',()=>fixture(home=>{
 const before=readdirSync(home);
 const s=inspectLocalMicroSeedInventory({home,run:systemctl});
 assert.equal(s.verified_manifest_count,0);
 assert.equal(s.scanned_root_count,5);
 assert.equal(s.recommended_action,'no_bootstrap_in_known_roots_inspect_other_owned_install_paths');
 assert.equal(s.services.count,2);
 assert.equal(s.services.units[0].active,false);
 assert.equal(s.signed_execution_verified,false);
 assert.equal(s.current_agent_live_verified,false);
 assert.deepEqual(readdirSync(home),before);
}));

test('valid manifest found without reading tokens, identity or private receipts',()=>fixture(home=>{
 const root=join(home,'.local/state/evercraft/microseed');
 mkdirSync(join(root,'identity'),{recursive:true,mode:0o700});
 mkdirSync(join(root,'secrets'),{recursive:true,mode:0o700});
 mkdirSync(join(root,'state','signed-receipts','v1'),{recursive:true,mode:0o700});
 const m=manifest();
 writeFileSync(join(root,'manifest.json'),JSON.stringify(m),{mode:0o600});
 writeFileSync(join(root,'identity','identity.json'),'do-not-open-private-identity',{mode:0o600});
 writeFileSync(join(root,'secrets','agent-token'),'super-secret-never-print',{mode:0o600});
 const before=readFileSync(join(root,'secrets','agent-token'),'utf8');
 const data=inspectLocalMicroSeedInventory({home,run:systemctl});
 assert.equal(data.verified_manifest_count,1);
 assert.equal(data.roots[0].bootstrap,'manifest_verified');
 assert.equal(data.roots[0].agent_claimed,true);
 assert.equal(data.roots[0].signed_receipts_declared,true);
 assert.equal(data.roots[0].signed_journal_state,'directory');
 assert.equal(data.recommended_action,'review_existing_bootstrap_before_any_deployment');
 assert.equal(data.current_agent_live_verified,false);
 assert.equal(data.credentials_read,false);
 const report=JSON.stringify(data);
 for(const secret of ['super-secret-never-print','synthetic-node-identity','synthetic-public-material','synthetic-approval']) {
  assert.ok(!report.includes(secret),'private identifier escaped');
 }
 assert.equal(readFileSync(join(root,'secrets','agent-token'),'utf8'),before);
}));

test('altered manifest and symlinked root are not automatically accepted',()=>fixture(home=>{
 const root=join(home,'.local/state/evercraft/microseed');
 mkdirSync(root,{recursive:true});
 const m=manifest();
 m.device_class='tampered';
 writeFileSync(join(root,'manifest.json'),JSON.stringify(m),{mode:0o600});
 const data=inspectLocalMicroSeedInventory({home,run:systemctl});
 assert.equal(data.verified_manifest_count,0);
 assert.equal(data.roots[0].bootstrap,'manifest_hash_mismatch');
 assert.equal(data.uncertain_root_count,1);
 const alt=join(home,'.config/evercraft');
 mkdirSync(alt,{recursive:true});
 symlinkSync(root,join(alt,'microseed'));
 const next=inspectLocalMicroSeedInventory({home,run:systemctl});
 assert.equal(next.roots[4].root_state,'symlink');
 assert.equal(next.verified_manifest_count,0);
}));

test('operator-specified existing roots checked without recursive scan',()=>fixture(home=>{
 const outside=join(home,'owner-custom');
 mkdirSync(outside,{recursive:true});
 writeFileSync(join(outside,'manifest.json'),JSON.stringify(manifest()),{mode:0o600});
 const data=inspectLocalMicroSeedInventory({home,additionalRoots:[outside],run:systemctl});
 assert.equal(data.scanned_root_count,6);
 assert.equal(data.roots[5].label,'operator_root_1');
 assert.equal(data.roots[5].bootstrap,'manifest_verified');
 assert.equal(data.network_requests_made,false);
 assert.equal(data.files_modified,false);
}));
