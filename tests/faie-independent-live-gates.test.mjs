import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow=fs.readFileSync('.github/workflows/faie-agnormal-launch-gate.yml','utf8');

test('FAIE external launch reruns when owner-managed archive installation or updater changes',()=>{
  for(const source of [
    'scripts/provision-faie-owned-history.mjs',
    'scripts/update-fabric-owned-edge.sh',
    'scripts/install-fabric-owned-edge.sh',
    'tests/faie-owned-history-provisioning.test.mjs'
  ])assert.ok(workflow.includes("- '"+source+"'"),source+' launch trigger missing');
});
test('a stale design partner page does not hide independent source evidence',()=>{
  const steps=workflow.split(/\n      - name: /);
  for(const stage of ['partner','browser','soil','site_scan','climate_history','land_history','fema_flood','nfip_area']){
    const matched=steps.filter(section=>section.includes('id: '+stage+'\n'));
    assert.equal(matched.length,1,stage+' missing or repeated');
    assert.match(matched[0],/continue-on-error: true/,stage+' needs diagnostic continuation');
  }
  const root=steps.filter(section=>section.includes('id: verify\n'));
  assert.equal(root.length,1,'root verifier missing');
  assert.doesNotMatch(root[0],/continue-on-error: true/, 'root/identity verification cannot be bypassed');
});
test('diagnostic continuation never changes the aggregate release gate from failure to success',()=>{
  assert.match(workflow,/- name: Publish FAIE launch status\n\s*if: always\(\)/);
  assert.match(workflow,/VERIFY_OUTCOME.*steps\.verify\.outcome/);
  assert.match(workflow,/PARTNER_OUTCOME.*steps\.partner\.outcome/);
  assert.match(workflow,/LAND_HISTORY_OUTCOME.*steps\.land_history\.outcome/);
  assert.match(workflow,/NFIP_OUTCOME.*steps\.nfip_area\.outcome/);
  assert.match(workflow,/\[ "\$NFIP_OUTCOME" = "success" \]/);
  const composite=workflow.slice(workflow.indexOf('- name: Enforce complete FAIE public launch verification'));
  assert.ok(composite.length>200,'terminal composite enforcement is mandatory');
  assert.match(composite,/if: always\(\)/);
  assert.match(composite,/for stage in VERIFY PARTNER BROWSER SOIL SITE_SCAN CLIMATE LAND_HISTORY FLOOD NFIP/);
  assert.match(composite,/if \[ "\$outcome" != "success" \]; then/);
  assert.match(composite,/exit 1/);
});
test('each independent source emits its own receipt, never a synthetic green result',()=>{
  for(const s of [
    'faie-land-history-live-acceptance.json',
    'faie-fema-flood-live-acceptance.json',
    'faie-nfip-wa-live-acceptance.json'
  ])assert.ok(workflow.includes(s),s+' artifact required');
  assert.doesNotMatch(workflow,/NFIP_OUTCOME: success|LAND_HISTORY_OUTCOME: success/);
});
