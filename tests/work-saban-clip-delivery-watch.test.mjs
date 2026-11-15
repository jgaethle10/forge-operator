import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {auditWorkSabanDelivery,runWorkSabanDeliveryWatch,CAMPAIGN} from '../systemia/clip/work-saban-delivery-watch.mjs';

const queueFile='distribution/marketing/work-saban-clip-evergreen-20261030.review.json';
const queue=JSON.parse(fs.readFileSync(queueFile,'utf8'));
const now=new Date('2026-11-09T21:00:00Z');
const fresh=()=>fs.mkdtempSync(path.join(os.tmpdir(),'work-saban-watch-'));
const claim=(id='work-saban-rotation-w1-facebook',patch={})=>({
 schema:'evercraft.clip.work-saban-facebook-claim.v1',campaign_id:CAMPAIGN,
 entry_id:id,page_id:'123456',
 status:'provider_receipt_recorded',authorization_ref:'grant_system_work_saban_clip_company',
 provider_post_id:'123456_789',provider_comment_id:'comment-001',
 provider_post_url:'https://www.facebook.com/123456/posts/789',
 published_at:'2026-11-04T20:00:00.000Z',
 ...patch,
});
function store(root,record){
 fs.mkdirSync(path.join(root,'entries'),{recursive:true});
 fs.writeFileSync(path.join(root,'entries',record.entry_id+'.json'),JSON.stringify(record));
}
test('without a real company account binding, no claims means no publication evidence',()=>{
 const dir=fresh();
 const r=auditWorkSabanDelivery({queue,privateStateDir:dir,now});
 assert.equal(r.status,'company_page_binding_missing');
 assert.equal(r.account_binding_present,false);
 assert.equal(r.counts.facebook_slots,4);
 assert.equal(r.counts.local_provider_receipt_recorded,0);
 assert.equal(r.counts.due_without_receipt,2);
 assert.equal(r.provider_network_checked,false);
 assert.equal(r.provider_receipts_not_public_visibility,true);
 assert.equal(r.slots.every(x=>x.provider_post_url===null),true);
});
test('configured account without private receipts is due, not published',()=>{
 const r=auditWorkSabanDelivery({queue,privateStateDir:fresh(),expectedPageId:'123456',now});
 assert.equal(r.status,'due_without_provider_receipt');
 assert.equal(r.account_binding_present,true);
 assert.equal(r.counts.local_provider_receipt_recorded,0);
});
test('complete provider receipt is local evidence only, not independent visibility',()=>{
 const dir=fresh();store(dir,claim());
 const r=auditWorkSabanDelivery({queue,privateStateDir:dir,expectedPageId:'123456',now});
 assert.equal(r.counts.local_provider_receipt_recorded,1);
 assert.equal(r.counts.due_without_receipt,1);
 assert.equal(r.status,'due_without_provider_receipt');
 assert.equal(r.slots[0].delivery_state,'local_provider_receipt_recorded');
 assert.equal(r.slots[0].public_anonymous_visibility_verified,false);
 assert.equal(r.slots[0].provider_post_url,'https://www.facebook.com/123456/posts/789');
 assert.equal(r.credentials_checked,false);
});
test('incomplete receipt or ambiguous provider response requires manual reconciliation',()=>{
 const dir=fresh();store(dir,claim(undefined,{status:'post_confirmed_comment_pending',provider_comment_id:null}));
 const r=auditWorkSabanDelivery({queue,privateStateDir:dir,expectedPageId:'123456',now});
 assert.equal(r.status,'manual_reconciliation_required');
 assert.equal(r.counts.manual_reconciliation_required,1);
 assert.equal(r.slots[0].provider_post_url,null);
});
test('invalid provider link, wrong Page identity, and malformed claim do not pass',()=>{
 for(const patch of [
  {provider_post_url:'https://example.org/not-facebook'},
  {page_id:'different-company-page'},
  {provider_comment_id:''},
  {authorization_ref:null}
 ]){
  const dir=fresh();store(dir,claim(undefined,patch));
  const r=auditWorkSabanDelivery({queue,privateStateDir:dir,expectedPageId:'123456',now});
  assert.equal(r.status,'claim_integrity_attention');
  assert.equal(r.counts.invalid_claims,1);
  assert.equal(r.counts.local_provider_receipt_recorded,0);
 }
});
test('private evidence generates read-only, identity-minimized KAIDANCE snapshot',()=>{
 const dir=fresh();const outputFile=path.join(dir,'watch','latest.json');
 store(dir,claim());
 const r=runWorkSabanDeliveryWatch({queueFile,privateStateDir:dir,expectedPageId:'123456',outputFile,now});
 assert.equal(r.counts.local_provider_receipt_recorded,1);
 const mission=JSON.parse(fs.readFileSync(path.join(dir,'watch','mission-snapshot.json'),'utf8'));
 assert.equal(mission.source_key,'work-saban-clip-delivery-watch');
 assert.equal(mission.mission_key,'evercraft-social-distribution-engine-2026-09');
 assert.equal(mission.boundaries.read_only,true);
 assert.equal(mission.boundaries.publication_authority,false);
 assert.equal(mission.boundaries.platform_visibility_independently_verified,false);
 assert.equal(mission.counts.admitted,1);
 assert.equal(mission.delivery_counts.facebook_slots,4);
 assert.doesNotMatch(JSON.stringify(mission),/123456_789|123456|comment-001|never-print-me/);
});
test('Compute registers watcher, private output, and KAIDANCE source without expanding authority',()=>{
 const v=JSON.parse(fs.readFileSync('systemia/core/resident-services.json','utf8'));
 const core=JSON.parse(fs.readFileSync('systemia/core/supervisor.evercraft.compute.json','utf8'));
 const watcher=v.services.find(s=>s.service_key==='work-saban-clip-delivery-watch');
 assert.ok(watcher);assert.equal(watcher.mode,'cycle');assert.equal(watcher.cadence_seconds,300);
 assert.equal(watcher.env_args['--state-dir'],'SYSTEMIA_WORK_SABAN_CLIP_STATE_DIR');
 assert.equal(watcher.env_args['--out'],'SYSTEMIA_WORK_SABAN_DELIVERY_WATCH_OUT');
 assert.equal(watcher.static_args,undefined);
 assert.ok(core.supervised_workflows.includes(watcher.service_key));
 const manifest=JSON.parse(fs.readFileSync(watcher.manifest,'utf8'));
 assert.equal(manifest.safety.read_only,true);
 assert.equal(manifest.safety.no_credential_lookup,true);
 const runtime=fs.readFileSync('systemia/compute/runtime-node.mjs','utf8');
 assert.match(runtime,/source_key: 'work-saban-clip-delivery-watch'/);
 assert.match(runtime,/SYSTEMIA_WORK_SABAN_DELIVERY_WATCH_OUT: path.join\(/);
});
