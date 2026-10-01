import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { bridgeSpectacleProduction } from './social-spectacle-clip-bridge.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'spectacle-clip-bridge-'));
const production=path.join(root,'production','candidate-a');
const queue=path.join(root,'clip-queue','delivery-a');
fs.mkdirSync(production,{recursive:true});
fs.mkdirSync(path.join(queue,'media'),{recursive:true});
const media=path.join(queue,'media','master.mp4');
fs.writeFileSync(media,Buffer.from('bounded-social-video'));
const mediaSha=crypto.createHash('sha256').update(fs.readFileSync(media)).digest('hex');
const render=path.join(production,'render.json');
const qc=path.join(production,'qc.json');
const editorial={schema:'evercraft.social-spectacle.editorial-preflight.v1',status:'accepted',score:10,maximum_score:10,publication_authority:false};
fs.writeFileSync(render,'{}');
fs.writeFileSync(qc,'{}');
const manifest={
  schema:'evercraft.clip.media-intake.v1',
  contentClass:'social_spectacle',
  deliveryId:'delivery-a',
  sourceApp:'fallen',
  sourceProjectId:'stage-a',
  sourceProjectVersion:1,
  state:'ready_for_clip_intake',
  media:{path:media,sha256:mediaSha,sizeBytes:fs.statSync(media).size,width:1080,height:1920,fps:30,durationSec:12,videoCodec:'h264'},
  captions:[],
  metadata:{title:'A river in motion',description:'A substantial evidence-grounded explanation. '.repeat(12),tags:['evercraft','water'],language:'en'},
  sourceObservedAt:'2026-10-01T00:00:00Z',
  freshnessState:'fresh',
  destinations:['facebook','instagram','linkedin','youtube'],
  heldUnverifiedDestinations:['tiktok'],
  provenance:{inputAssetIds:[],sourceRefs:['source:river'],continuityDigests:['proof'],renderReceiptPath:render,masterQcReceiptPath:qc},
  editorialGate:editorial,
  productionGrade:{status:'accepted',hero_kind:'data_visualization',text_primary:false,source_grounded:true},
  boundaries:{publicationAuthorityGranted:false,platformCredentialsConsumed:false,platformPublishStateAsserted:false,downstreamClipGateRequired:true},
  createdAt:'2026-10-01T00:05:00Z'
};
const manifestPath=path.join(production,'clip-intake.json');
fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2));
const stagedManifest=path.join(queue,'manifest.json');
fs.writeFileSync(stagedManifest,JSON.stringify(manifest,null,2));
const intake={
  schema:'evercraft.clip.intake-receipt.v1',
  deliveryId:'delivery-a',
  status:'staged',
  stagedManifestPath:stagedManifest,
  stagedManifestSha256:crypto.createHash('sha256').update(fs.readFileSync(stagedManifest)).digest('hex'),
  stagedMediaPath:media,
  mediaSha256:mediaSha,
  boundaries:{firstPartyQueue:true,inputBytesReverified:true,masterQcRequired:true,publicationAuthorityGranted:false}
};
const intakePath=path.join(queue,'intake-receipt.json');
fs.writeFileSync(intakePath,JSON.stringify(intake,null,2));
fs.writeFileSync(path.join(production,'production-receipt.json'),JSON.stringify({
  schema:'evercraft.social-spectacle.production-receipt.v1',
  candidate_id:'spectacle:river',
  status:'ready_for_clip_publish',
  clip_manifest:manifestPath,
  clip_intake_receipt:intakePath,
  media_sha256:mediaSha,
  publication_authority:false
},null,2));
const secretFile=path.join(root,'secret');
fs.writeFileSync(secretFile,'proof-secret');

const result=await bridgeSpectacleProduction({
  productionRoot:path.join(root,'production'),
  sharedSecretFile:secretFile,
  fetchEnabled:false,
  now:new Date('2026-10-01T00:10:00Z'),
});
assert.equal(result.status,'processed');
assert.equal(result.publication_claimed,false);
assert.equal(result.items.length,1);
assert.equal(result.items[0].status,'ready_for_compatibility_bridge');

const missing=await bridgeSpectacleProduction({
  productionRoot:path.join(root,'production'),
  sharedSecretFile:path.join(root,'missing-secret'),
  fetchEnabled:false,
});
assert.equal(missing.status,'held');
assert.equal(missing.reason,'clip_shared_secret_file_missing');

manifest.freshnessState='stale';
fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2));
const staleRoot=path.join(root,'stale-production','candidate-b');
fs.mkdirSync(staleRoot,{recursive:true});
fs.writeFileSync(path.join(staleRoot,'production-receipt.json'),JSON.stringify({
  schema:'evercraft.social-spectacle.production-receipt.v1',
  candidate_id:'spectacle:stale',
  status:'ready_for_clip_publish',
  clip_manifest:manifestPath,
  clip_intake_receipt:intakePath,
  media_sha256:mediaSha,
  publication_authority:false
},null,2));
const stale=await bridgeSpectacleProduction({
  productionRoot:path.join(root,'stale-production'),
  sharedSecretFile:secretFile,
  fetchEnabled:false,
});
assert.equal(stale.items[0].status,'held');
assert.equal(stale.items[0].reason,'source_freshness_not_fresh');

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.social-spectacle.clip-bridge-proof.v1',
  media_digest_bound:true,
  editorial_gate_bound:true,
  freshness_fail_closed:true,
  shared_secret_required:true,
  publication_claim_requires_observed_provider_rows:true,
},null,2));
