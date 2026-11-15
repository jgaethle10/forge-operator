#!/usr/bin/env node
/**
 * Read-only, bounded MicroSeed inventory for the *local* Evercraft host.
 * No secret contents, private-key reads, network traffic, service mutation,
 * installation, trust grant, or execution.
 */
import { lstatSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { normalizeMicroDeviceManifest } from './microseed-device-bridge.mjs';

const MAX_MANIFEST = 256 * 1024;
const LOCATIONS = Object.freeze([
  ['canonical_state', '.local/state/evercraft/microseed'],
  ['legacy_share', '.local/share/evercraft/microseed'],
  ['dedicated_share', '.local/share/evercraft-microseed'],
  ['alternate_state', '.local/state/evercraft/microseed-native'],
  ['config_root', '.config/evercraft/microseed'],
]);

function nodeType(p) {
  try {
    const st = lstatSync(p);
    if (st.isSymbolicLink()) return 'symlink';
    if (st.isDirectory()) return 'directory';
    if (st.isFile()) return 'file';
    return 'other';
  } catch (err) {
    if (err.code === 'ENOENT') return 'missing';
    return 'inaccessible';
  }
}
function inspectRoot(root, label) {
  const out = {
    label,
    root_state: nodeType(root),
    bootstrap: 'not_found',
    private_identity_state: 'not_checked',
    token_file_state: 'not_checked',
    signed_journal_state: 'not_checked',
    agent_claimed: false,
    manifest_integrity_verified: false,
  };
  if (out.root_state !== 'directory') return out;
  const manifestFile = join(root, 'manifest.json');
  const manifestType = nodeType(manifestFile);
  if (manifestType === 'missing') return out;
  if (manifestType !== 'file') {
    out.bootstrap = 'manifest_unsafe_or_inaccessible';
    return out;
  }
  try {
    const stat = lstatSync(manifestFile);
    if (stat.size < 1 || stat.size > MAX_MANIFEST) {
      out.bootstrap = 'manifest_size_invalid';
      return out;
    }
    const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
    if (manifest?.schema !== 'evercraft.microseed.device-manifest.v1') {
      out.bootstrap = 'manifest_schema_invalid';
      return out;
    }
    // On-disk manifest integrity does not imply operator authorization.
    const normalized = normalizeMicroDeviceManifest(manifest);
    out.manifest_integrity_verified = normalized.manifest_hash === manifest.manifest_hash;
    out.agent_claimed = manifest.bridge_mode === 'native_agent' &&
      manifest.compute_execution_mode === 'native_device';
    out.signed_receipts_declared = manifest.attestation?.receipt_signing_required === true;
    out.bootstrap = out.manifest_integrity_verified ? 'manifest_verified' : 'manifest_hash_mismatch';
    out.private_identity_state = nodeType(join(root, 'identity', 'identity.json'));
    out.token_file_state = nodeType(join(root, 'secrets', 'agent-token'));
    out.signed_journal_state = nodeType(join(root, 'state', 'signed-receipts', 'v1'));
    // Do not open or print identity, token, or private receipt bytes.
  } catch {
    out.bootstrap = 'manifest_invalid_or_unreadable';
  }
  return out;
}
function discoverUserUnits(run) {
  const result = run('systemctl', [
    '--user', 'list-units', '--all', '--type=service', '--plain', '--no-legend', '--no-pager',
  ]);
  if (result?.status !== 0 || typeof result.stdout !== 'string') return {state:'unavailable', count:0, units:[]};
  const units = result.stdout.split(/\r?\n/)
    .map(x=>x.trim().split(/\s+/))
    .filter(a=>a.length>=4 && /(?:microseed|saban)/i.test(a[0]))
    .slice(0,25)
    .map(a=>({name:a[0],active:a[2]==='active',substate:a[3]}));
  return {state:'observed',count:units.length,units};
}
export function inspectLocalMicroSeedInventory({
  home=homedir(),
  run=(cmd,args)=>spawnSync(cmd,args,{encoding:'utf8',timeout:2500,maxBuffer:256*1024}),
  additionalRoots=[],
}={}) {
  if (typeof home !== 'string' || home.length === 0) throw Error('inventory_home_required');
  if (!Array.isArray(additionalRoots)|| additionalRoots.length>3) throw Error('inventory_additional_roots_invalid');
  const locations = LOCATIONS.map(([label, suffix])=>[label,join(resolve(home),suffix)]);
  for (let i=0;i<additionalRoots.length;i++) {
    const root=additionalRoots[i];
    if(typeof root !== 'string'|| !root.startsWith('/') ||root.length>500) throw Error('inventory_root_invalid');
    locations.push(['operator_root_'+(i+1),resolve(root)]);
  }
  const roots = locations.map(([label,root])=>inspectRoot(root,label));
  const units = discoverUserUnits(run);
  const found = roots.filter(x=>x.bootstrap==='manifest_verified');
  const suspect = roots.filter(x=>x.bootstrap!=='not_found' && x.bootstrap!=='manifest_verified');
  return {
    schema:'evercraft.microseed.local-inventory.v1',
    mode:'read_only_bounded_local_discovery',
    source:'local_files_and_user_service_metadata_only',
    scanned_root_count:roots.length,
    verified_manifest_count:found.length,
    uncertain_root_count:suspect.length,
    roots,
    services:units,
    recommended_action:found.length>0 ? 'review_existing_bootstrap_before_any_deployment'
      : suspect.length>0 ? 'review_existing_ambiguous_roots_do_not_rebootstrap'
      : 'no_bootstrap_in_known_roots_inspect_other_owned_install_paths',
    current_agent_live_verified:false,
    active_device_authorization_verified:false,
    passport_access_verified:false,
    signed_execution_verified:false,
    operator_identity_verified:false,
    physical_hardware_attested:false,
    files_modified:false,
    network_requests_made:false,
    credentials_read:false,
  };
}
function main(){
  const args=process.argv.slice(2);
  if(args.includes('--help')) {
    process.stdout.write('Usage: node systemia/saban/microseed-local-inventory.mjs [--root /absolute/previous/microseed-root]\n');
    process.stdout.write('Read-only; no network, installs, identity rotations, or secret reads.\n');
    return;
  }
  const additionalRoots=[];
  for(let i=0;i<args.length;i++){
    if(args[i]!=='--root'||!args[i+1]) throw Error('inventory_argument_invalid');
    additionalRoots.push(args[++i]);
  }
  const result=inspectLocalMicroSeedInventory({additionalRoots});
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{main()}catch(err){
    process.stderr.write(JSON.stringify({
      schema:'evercraft.microseed.local-inventory.v1',ok:false,state:'hold',
      error:/^inventory_[a-z_]+$/.test(err.message)?err.message:'inventory_failed',
    })+'\n');
    process.exitCode=1;
  }
}
