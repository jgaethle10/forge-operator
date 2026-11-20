import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
 PRIVATE_ASSET_DEMAND_SCHEMA,PRIVATE_ASSET_DEMAND_RECEIPT,
 draftPrivateAssetDemand,validatePrivateAssetDemand,stagePrivateAssetDemand,
 readPrivateAssetDemand
} from './private-asset-demand.mjs';

const now=()=>new Date('2026-11-20T00:00:00.000Z');
const rand=()=>Buffer.from('00112233445566778899aabbccddeeff','hex');
const request=()=>draftPrivateAssetDemand({
 caseRef:'commercial-recovery-pilot',expectedAssetCount:12,randomBytes:rand,now
});
function privateFixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wing-asset-demand-'));
 fs.chmodSync(dir,0o700);t.after(()=>fs.rmSync(dir,{force:true,recursive:true}));
 return dir;
}
test('draft requests original assets from Harbor for Fallen without granting authority',()=>{
 const draft=request();
 assert.equal(draft.schema,PRIVATE_ASSET_DEMAND_SCHEMA);
 assert.equal(draft.requestId,'00112233445566778899aabbccddeeff');
 assert.equal(draft.expectedAssetCount,12);
 assert.equal(draft.state,'PENDING_AUTHENTICATED_HARBOR_PICKUP');
 assert.equal(draft.customerContactAuthorized,false);
 assert.equal(draft.paymentAuthorized,false);
 assert.equal(draft.productionAuthorized,false);
 assert.equal(draft.fromWing,'harbor');
 assert.equal(draft.toWing,'fallen');
 assert.deepEqual(validatePrivateAssetDemand(draft),draft);
 assert.equal(JSON.stringify(draft).includes('customer@example.com'),false);
});
test('owner-private staged request is 0600, durable and idempotent',t=>{
 const dir=privateFixture(t),draft=request();
 const first=stagePrivateAssetDemand({request:draft,privateQueueDir:dir});
 assert.equal(first.schema,PRIVATE_ASSET_DEMAND_RECEIPT);
 assert.equal(first.stage,'OWNER_PRIVATE_CANDIDATE_STAGED');
 assert.equal(first.harborReceived,false);
 assert.equal(first.systemiaAdmitted,false);
 assert.equal(first.transportStarted,false);
 assert.equal(first.customerReleaseAuthorized,false);
 assert.equal(first.idempotent,false);
 const file=path.join(dir,draft.requestId+'.json');
 assert.equal(fs.statSync(file).mode&0o077,0);
 assert.deepEqual(readPrivateAssetDemand({requestId:draft.requestId,privateQueueDir:dir}),draft);
 const second=stagePrivateAssetDemand({request:draft,privateQueueDir:dir});
 assert.equal(second.idempotent,true);
 assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')),draft);
});
test('one request id cannot silently change the requested scope',t=>{
 const dir=privateFixture(t),draft=request();
 stagePrivateAssetDemand({request:draft,privateQueueDir:dir});
 const changed={...draft,expectedAssetCount:11};
 assert.throws(()=>stagePrivateAssetDemand({request:changed,privateQueueDir:dir}),
  /request_id_conflict/);
 assert.equal(readPrivateAssetDemand({requestId:draft.requestId,privateQueueDir:dir}).expectedAssetCount,12);
});
test('unsafe or externally empowered candidates fail closed',()=>{
 const good=request();
 for(const patch of [
  {customerContactAuthorized:true},{paymentAuthorized:true},
  {productionAuthorized:true},{fromWing:'outside'},
  {toWing:'unknown'},{requestedBy:'harbor'},{state:'APPROVED'},
  {caseRef:'customer@example.com'},{caseRef:'client name'},
  {assetKind:'shell'},{expectedAssetCount:101},
  {intent:'SEND_PREVIEW'},{requestId:'../outside'},
  {createdAt:'2026-11-20T00:00:00Z'},
 ]){
  assert.throws(()=>validatePrivateAssetDemand({...good,...patch}),
   /wing_asset_demand_/);
 }
 assert.throws(()=>validatePrivateAssetDemand({...good,privateKey:'secret'}),
  /invalid_shape/);
 assert.throws(()=>draftPrivateAssetDemand({caseRef:'customer name',now,randomBytes:rand}),
  /opaque_case_ref_required/);
 assert.throws(()=>draftPrivateAssetDemand({caseRef:good.caseRef,
  expectedAssetCount:0,now,randomBytes:rand}),/scope_or_authority_invalid/);
});
test('world-readable directory or symlinked directory never stores the request',t=>{
 const dir=privateFixture(t),draft=request();
 fs.chmodSync(dir,0o755);
 assert.throws(()=>stagePrivateAssetDemand({request:draft,privateQueueDir:dir}),
  /private_queue_permissions_required/);
 fs.chmodSync(dir,0o700);
 const alias=dir+'-alias';
 fs.symlinkSync(dir,alias);t.after(()=>fs.rmSync(alias,{force:true}));
 assert.throws(()=>stagePrivateAssetDemand({request:draft,privateQueueDir:alias}),
  /unsafe_parent_directory/);
 assert.equal(fs.readdirSync(dir).length,0);
});
test('dangling or existing request symlink cannot be overwritten or read',t=>{
 const dir=privateFixture(t),draft=request();
 const file=path.join(dir,draft.requestId+'.json');
 fs.symlinkSync(path.join(dir,'missing.json'),file);
 assert.throws(()=>stagePrivateAssetDemand({request:draft,privateQueueDir:dir}),
  /existing_request_not_private/);
 assert.throws(()=>readPrivateAssetDemand({requestId:draft.requestId,privateQueueDir:dir}),
  /private_request_invalid/);
 assert.equal(fs.lstatSync(file).isSymbolicLink(),true);
});
test('matching filename and private bytes are required when reading',t=>{
 const dir=privateFixture(t),draft=request();
 const mismatched={...draft,requestId:'f'.repeat(32)};
 const file=path.join(dir,draft.requestId+'.json');
 fs.writeFileSync(file,JSON.stringify(mismatched)+'\n',{mode:0o600});
 assert.throws(()=>readPrivateAssetDemand({requestId:draft.requestId,privateQueueDir:dir}),
  /id_filename_mismatch/);
 fs.chmodSync(file,0o644);
 assert.throws(()=>readPrivateAssetDemand({requestId:draft.requestId,privateQueueDir:dir}),
  /private_request_invalid/);
});
