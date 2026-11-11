import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

import {analyzeBrokerRestartSafety} from '../scripts/inspect-penguin-broker-restart-safety.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const script=path.join(root,'scripts/inspect-penguin-broker-restart-safety.mjs');
const source=fs.readFileSync(script,'utf8');
const expected='/opt/evercraft/forge-operator/systemia/yard/remote-broker-resident.mjs';
function fixture(overrides={}){
  return {
    unit:{load_state:'loaded',active_state:'active',user:'evercraft',group:'evercraft',
      restart:'always',script:expected,...(overrides.unit||{})},
    proc:{pid:407,cwd:'/opt/evercraft/forge-operator',script:expected,...(overrides.proc||{})},
    configuredScriptState:{path:expected,present:false,regular_file:false,symlink:false,
      ...(overrides.configuredScriptState||{})},
    expectedScriptState:{path:expected,present:false,regular_file:false,symlink:false,
      ...(overrides.expectedScriptState||{})},
  };
}
test('active Node process with deleted launcher is a restart blocker, not successful recovery',()=>{
  const r=analyzeBrokerRestartSafety(fixture());
  assert.equal(r.active,true);
  assert.equal(r.running_pid,407);
  assert.equal(r.safe_restart_authorized,false);
  assert.equal(r.must_preserve_running_process,true);
  assert.deepEqual(r.issues.sort(),[
    'legacy_broker_entrypoint_missing','systemd_launch_source_unavailable'].sort());
  assert.equal(r.source_provenance_verified,false);
  assert.equal(r.identity_compatibility_verified,false);
  assert.equal(r.secrets_read,false);
  assert.equal(r.service_changes,false);
  assert.equal(r.filesystem_changes,false);
});
test('even if launcher exists, source parity and broker lease behavior remain unverified',()=>{
  const r=analyzeBrokerRestartSafety(fixture({
    configuredScriptState:{present:true,regular_file:true,sha256:'a'.repeat(64)},
    expectedScriptState:{present:true,regular_file:true,sha256:'a'.repeat(64)},
  }));
  assert.deepEqual(r.issues,[]);
  assert.equal(r.safe_restart_authorized,false);
  assert.equal(r.source_provenance_verified,false);
  assert.equal(r.identity_compatibility_verified,false);
});
test('disagreed live/source paths, different user and absent process fail closed',()=>{
  const r=analyzeBrokerRestartSafety(fixture({
    unit:{user:'root',script:'/opt/evercraft/forge-operator/systemia/yard/other.mjs'},
    proc:{pid:null,script:null,cwd:'/tmp'},
  }));
  for(const issue of [
    'broker_unit_account_mismatch',
    'broker_pid_unverified',
    'running_process_script_unresolved',
    'service_entrypoint_differs_from_expected_legacy_path',
    'unexpected_running_working_directory',
  ])assert.ok(r.issues.includes(issue),issue);
  assert.equal(r.safe_restart_authorized,false);
});
test('inspection tool never echoes unrestricted argv or unit environment',()=>{
  assert.match(source,/systemctl.*\['show'/s);
  assert.match(source,/argv\\\[\\\]=/);
  assert.match(source,/redactedScriptPath/);
  assert.match(source,/process\.exitCode=3/);
  assert.doesNotMatch(source,/execFileSync\(['"]systemctl['"],\s*\[\s*['"]restart['"]/);
  assert.doesNotMatch(source,/execFileSync\(['"]systemctl['"],\s*\[\s*['"]stop['"]/);
  assert.doesNotMatch(source,/\b(?:chmodSync|chownSync|mkdirSync|rmSync|unlinkSync|renameSync|writeFileSync|copyFileSync)\s*\(/);
  assert.doesNotMatch(source,/\/proc\/['"]?\+?pid\+?['"]?\/environ/);
  assert.doesNotMatch(source,/shellShow\(['"]Environment['"]\)/);
  assert.doesNotMatch(source,/console\.log\(\s*execStart/);
});
test('node syntax and no-privilege execution fail-closed',()=>{
  const syntax=spawnSync(process.execPath,['--check',script],{encoding:'utf8'});
  assert.equal(syntax.status,0,syntax.stderr);
  if(process.getuid?.()!==0){
    const run=spawnSync(process.execPath,[script],{encoding:'utf8'});
    assert.equal(run.status,2);
    assert.match(run.stderr,/read_only_broker_audit_requires_sudo/);
  }
});
