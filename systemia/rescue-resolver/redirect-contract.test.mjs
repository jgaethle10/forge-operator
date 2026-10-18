import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { RESCUE,createRule,appliesToUrl,destinationIsAllowed } from './extension/redirect-contract.mjs';

const root = new URL('./extension/',import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL('manifest.json',root),'utf8'));
const html = fs.readFileSync(new URL('options.html',root),'utf8');
const js = fs.readFileSync(new URL('options.js',root),'utf8');

test('redirect targets only original apex and www top-level browser navigations',()=>{
  const rule=createRule();
  assert.deepEqual(rule.condition.resourceTypes,['main_frame']);
  assert.equal(rule.action.redirect.url,RESCUE.target);
  for(const u of ['https://voteroman.com/','https://www.voteroman.com/','http://voteroman.com/','https://voteroman.com/positions']){
    assert.equal(appliesToUrl(u),true,u);
  }
  for(const u of ['https://donate.voteroman.com/','https://some.voteroman.com/','https://voteroman.com.evil.example/','https://evoteroman.com/','https://fabric.systemiacommandcenters.com/campaigns/roman/','https://voteroman.com@evil.example/']){
    assert.equal(appliesToUrl(u),false,u);
  }
});
test('destination is locked to independently known HTTPS recovery endpoint',()=>{
  assert.equal(destinationIsAllowed(RESCUE.target),true);
  for(const u of ['http://fabric.systemiacommandcenters.com/campaigns/roman/','https://evil.example/','https://fabric.systemiacommandcenters.com.evil.example/campaigns/roman/','https://donate.voteroman.com/']){
    assert.equal(destinationIsAllowed(u),false,u);
    assert.throws(()=>createRule(u),/unreviewed_rescue_destination/);
  }
});
test('extension is opt-in, disabled at install, no donation or blanket website permissions',()=>{
  assert.equal(manifest.manifest_version,3);
  assert.deepEqual(manifest.permissions,['declarativeNetRequestWithHostAccess']);
  assert.equal('background' in manifest,false);
  assert.equal('declarative_net_request' in manifest,false);
  assert.ok(manifest.host_permissions.every(x=>!x.includes('donate.')&&!x.includes('<all_urls>')));
  assert.equal(manifest.options_page,'options.html');
  assert.equal(manifest.action.default_popup,'options.html');
  assert.match(html,/only changes my browser/);
  assert.match(html,/id="enable" disabled/);
  assert.match(js,/if\(!consent\.checked\) return/);
  assert.match(js,/removeRuleIds:\[RESCUE\.ruleId\]/);
  assert.match(js,/getDynamicRules/);
  assert.doesNotMatch(js,/onInstalled|onStartup|setInterval|alarms/);
});
