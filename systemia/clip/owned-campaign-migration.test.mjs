import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {
 SOURCE_SCHEMA,OWNED_SCHEMA,prepareOwnedClipSnapshot,
 inspectOwnedClipSnapshot,stageOwnedClipSnapshot,loadOwnedClipSnapshot,
} from './owned-campaign-migration.mjs';

const factory=()=>({
 schema:SOURCE_SCHEMA,
 records:{
  SocialPage:[{id:'page-source-1',platform:'facebook',external_id:'1253915241138545',
    name:'Evercraft',status:'active',access_token:'NEVER_EXPORT_THIS'}],
  DistributionCampaign:[{id:'campaign-source-1',campaign_key:'relay-rc35',
    title:'Evercraft Relay',status:'active',rights_state:'licensed',
    target_platforms:['facebook','instagram'],refresh_token:'TOP_SECRET'}],
  ContentPackage:[{id:'package-source-1',source_asset:'relay-rc35-master-sha256-'+'a'.repeat(64),
    content_type:'video',body:'Our first commercial. Clarity before consequences.',
    target_page_id:'1253915241138545',target_page_name:'Evercraft',
    media_url:'https://media.base44.com/videos/public/clip/Relay_RC35.mp4',
    status:'published',published_post_id:'legacy-123',cookie:'SECRET_COOKIE'}],
  CampaignReleaseSlot:[{id:'slot-source-1',slot_key:'relay-rc35-fb',
    content_package_id:'package-source-1',target_page_id:'1253915241138545',
    not_before:'2026-10-23T14:05:00-07:00',status:'published'}],
  MediaDistributionEnvelope:[{id:'env-source-1',envelope_key:'relay-rc35-fb',
    source_app:'Evercraft Clip',source_package_key:'relay-rc35',title:'Commercial',
    target_platform:'facebook',status:'published',rights_state:'owned',
    media_url:'https://media.base44.com/videos/public/clip/Relay_RC35.mp4'}],
 },
});

test('Base44 draft and posted status migrate ONLY to held, with secrets excluded',()=>{
 const snap=prepareOwnedClipSnapshot(factory());
 assert.equal(snap.schema,OWNED_SCHEMA);
 assert.deepEqual(snap.counts,{
  SocialPage:1,DistributionCampaign:1,ContentPackage:1,
  CampaignReleaseSlot:1,MediaDistributionEnvelope:1,
 });
 assert.equal(inspectOwnedClipSnapshot(snap).status,'ACCEPTED_FOR_PRIVATE_STAGING');
 const flattened=JSON.stringify(snap);
 for(const secret of ['NEVER_EXPORT_THIS','TOP_SECRET','SECRET_COOKIE','published_post_id'])assert.equal(flattened.includes(secret),false,secret);
 assert.equal(snap.records.ContentPackage[0].status,'draft');
 assert.equal(snap.records.ContentPackage[0].media_url,null);
 assert.equal(snap.records.ContentPackage[0].owned_media_ready,false);
 assert.equal(snap.records.ContentPackage[0].media_migration_state,'legacy_media_needs_copy');
 assert.equal(snap.records.DistributionCampaign[0].rights_state,'pending');
 assert.equal(snap.records.CampaignReleaseSlot[0].not_before,null);
 assert.equal(snap.records.CampaignReleaseSlot[0].not_before_original,'2026-10-23T14:05:00-07:00');
 assert.equal(snap.records.CampaignReleaseSlot[0].content_package_id,snap.records.ContentPackage[0].owned_id);
 assert.equal(snap.publish_authority_granted,false);
 assert.equal(snap.cutover_proven,false);
});

test('migration stage is private, immutable and idempotent',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'clip-owned-cutover-'));
 try{
  const snap=prepareOwnedClipSnapshot(factory());
  const staged=stageOwnedClipSnapshot({snapshot:snap,stateDir:dir});
  assert.equal(staged.status,'STAGED_PRIVATE_NOT_PUBLISHED');
  assert.equal(stageOwnedClipSnapshot({snapshot:snap,stateDir:dir}).status,'ALREADY_STAGED');
  assert.deepEqual(loadOwnedClipSnapshot(dir),snap);
  const stat=fs.statSync(staged.path);
  assert.equal(stat.mode & 0o777,0o600);
  const changed=factory();changed.records.ContentPackage[0].body+=' Updated';
  assert.throws(()=>stageOwnedClipSnapshot({snapshot:prepareOwnedClipSnapshot(changed),stateDir:dir}),/immutable_snapshot_conflict/);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('source order is irrelevant for a deterministic cryptographic receipt',()=>{
 const raw=factory();
 raw.records.ContentPackage.push({...raw.records.ContentPackage[0],id:'package-source-2',body:'Additional commercial',status:'draft'});
 const a=prepareOwnedClipSnapshot(raw);
 raw.records.ContentPackage.reverse();
 const b=prepareOwnedClipSnapshot(raw);
 assert.equal(a.content_sha256,b.content_sha256);
 assert.throws(()=>inspectOwnedClipSnapshot({...a,counts:{...a.counts,ContentPackage:999}}),/owned_digest_mismatch/);
});

test('excluded brands are retained for evidence but are always unpublishable',()=>{
 const blocked=factory();blocked.records.ContentPackage[0].target_page_id='924929507380565';
 blocked.records.SocialPage[0].external_id='990957940766644';
 blocked.records.CampaignReleaseSlot[0].target_page_id='116675248108887';
 const snap=prepareOwnedClipSnapshot(blocked);
 assert.equal(inspectOwnedClipSnapshot(snap).status,'ACCEPTED_FOR_PRIVATE_STAGING');
 assert.equal(snap.records.ContentPackage[0].status,'held');
 assert.equal(snap.records.ContentPackage[0].is_publish_excluded,true);
 assert.equal(snap.records.SocialPage[0].status,'excluded');
 assert.equal(snap.records.CampaignReleaseSlot[0].is_publish_excluded,true);
 const orphan=factory();orphan.records.CampaignReleaseSlot[0].content_package_id='does-not-exist';
 assert.throws(()=>prepareOwnedClipSnapshot(orphan),/orphan_content_package/);
});

test('schema, duplicate keys, unknown tables and tampered publication claims fail',()=>{
 const duplicate=factory();duplicate.records.ContentPackage.push({...duplicate.records.ContentPackage[0]});
 assert.throws(()=>prepareOwnedClipSnapshot(duplicate),/duplicate_source_record/);
 const unknown=factory();unknown.records.UnknownThings=[];
 assert.throws(()=>prepareOwnedClipSnapshot(unknown),/unexpected_table/);
 const snap=prepareOwnedClipSnapshot(factory());
 const forged=structuredClone(snap);forged.records.ContentPackage[0].status='published';
 assert.throws(()=>inspectOwnedClipSnapshot(forged),/owned_digest_mismatch/);
});

test('missing private destination or rejected lock cannot commit state',()=>{
 const snap=prepareOwnedClipSnapshot(factory());
 assert.throws(()=>stageOwnedClipSnapshot({snapshot:snap,stateDir:''}),/private_state_dir_missing/);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'clip-owned-lock-'));
 try{
  fs.writeFileSync(path.join(dir,'clip-campaign-migration.json.lock'),'owner lock');
  assert.throws(()=>stageOwnedClipSnapshot({snapshot:snap,stateDir:dir}),/concurrent_import_or_stale_lock/);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});


test('private migration cannot write into the checked-out repo, including through a symlink',()=>{
 const snap=prepareOwnedClipSnapshot(factory());
 const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
 const wouldBePath=path.join(repoRoot,'clip-unsafe-private-stage-test');
 assert.equal(fs.existsSync(wouldBePath),false);
 assert.throws(()=>stageOwnedClipSnapshot({snapshot:snap,stateDir:wouldBePath}),/unsafe_state_dir/);
 assert.equal(fs.existsSync(wouldBePath),false);
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'clip-owned-symlink-'));
 try{
  const link=path.join(temp,'checkout-link');
  fs.symlinkSync(repoRoot,link,'dir');
  assert.throws(()=>stageOwnedClipSnapshot({snapshot:snap,stateDir:path.join(link,'systemia')}),/unsafe_state_dir/);
 }finally{fs.rmSync(temp,{recursive:true,force:true})}
});

test('private migration rejects an existing group/world-readable state directory',()=>{
 const snap=prepareOwnedClipSnapshot(factory());
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'clip-owned-permissions-'));
 try{
  fs.chmodSync(temp,0o755);
  assert.throws(()=>stageOwnedClipSnapshot({snapshot:snap,stateDir:temp}),/state_dir_not_private/);
 }finally{fs.chmodSync(temp,0o700);fs.rmSync(temp,{recursive:true,force:true})}
});
