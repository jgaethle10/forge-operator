import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {validatePage,buildOwnedBusinessRescue} from './package-owned-business-rescue.mjs';

test('both sites are portable and retain customer-contact actions',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-business-rescue-'));
 try {
  const receipt=buildOwnedBusinessRescue(process.cwd(),temp);
  assert.equal(receipt.classification,'portable_static_package_not_deployed');
  assert.equal(receipt.files.length,3);
  assert.equal(receipt.dns_cutover_verified,false);
  assert.equal(receipt.online_customer_path_verified,false);
  for(const row of receipt.files) {
    const html=fs.readFileSync(path.join(temp,row.target),'utf8');
    assert.equal(validatePage(row.target,html),row.sha256);
  }
 }finally{fs.rmSync(temp,{recursive:true,force:true})}
});
test('stale legacy provider routes cannot enter the portable pages',()=>{
 assert.throws(()=>validatePage('havenly/index.html','<!doctype html><html>HAVENLY Cleaning sms:+15095605190 mailto:havenlycleaning@gmail.com https://example.base44.app</html>'),/legacy_provider_dependency/);
});
test('customer-contact links cannot silently disappear',()=>{
 const html=fs.readFileSync('public/havenly/index.html','utf8').replace(/sms:\+15095605190/g,'sms:+10000000000');
 assert.throws(()=>validatePage('havenly/index.html',html),/missing_critical_customer_route/);
});
