import test from 'node:test';
import assert from 'node:assert/strict';
import {HARBOR_FINDMYPART_LAUNCH as kit,validateHarborLaunchKit} from '../systemia/distribution/harbor/findmypart-launch.mjs';
test('Harbor handoff respects FindMyPart original brand and four platforms',()=>{
 const check=validateHarborLaunchKit();
 assert.equal(check.pass,true,check.failures.join(','));
 assert.equal(check.postable,false);
 assert.deepEqual(Object.keys(kit.captions),['facebook','instagram','linkedin','tiktok']);
 assert.equal(kit.branding.colors.orange,'#f16b27');
 assert.equal(kit.branding.colors.blue,'#2565a3');
});
test('no publication or authenticated transport inferred from staging',()=>{
 assert.equal(kit.outcome.posted,false);assert.equal(kit.authenticated_systemia_handoff,false);
 assert.equal(kit.human_attached_handoff_required,true);
 assert.equal(kit.platform_access.linkedin,'no_verified_harbor_connection');
 assert.equal(kit.platform_access.tiktok,'no_verified_harbor_connection');
});
test('excluded pages, green branding and publishing attempts rejected',()=>{
 assert.equal(validateHarborLaunchKit({...kit,publish_authorized:true}).pass,false);
 assert.equal(validateHarborLaunchKit({...kit,prohibited_targets:[]}).pass,false);
 assert.equal(validateHarborLaunchKit({...kit,branding:{...kit.branding,colors:{...kit.branding.colors,orange:'#c5fc83'}}}).pass,false);
});
