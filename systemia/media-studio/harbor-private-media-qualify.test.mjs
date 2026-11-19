import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {verifyPrivateMediaImport,SCHEMA as HARBOR_SCHEMA} from '../../scripts/nextgen/verify-harbor-private-media-import.mjs';
import {qualifyPrivateHarborBatch,QUALIFICATION_SCHEMA} from './harbor-private-media-qualify.mjs';
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function ffmpeg(args){
  const r=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y',...args],
    {encoding:'utf8',timeout:40000,maxBuffer:2000000});
  assert.equal(r.status,0,String(r.stderr||r.error?.message||'FFmpeg failed'));
}
async function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-harbor-qualify-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const assetDir=path.join(root,'assets'),outputDir=path.join(root,'qualified');
  fs.mkdirSync(assetDir,{mode:0o700});
  ffmpeg(['-f','lavfi','-i','testsrc2=size=640x360:rate=24','-t','2',
    '-c:v','libx264','-pix_fmt','yuv420p','-an',path.join(assetDir,'asset-001.mp4')]);
  ffmpeg(['-f','lavfi','-i','color=c=blue:size=640x360:rate=1','-frames:v','1',
    path.join(assetDir,'asset-002.png')]);
  const assets=[
    {filename:'asset-001.mp4',mediaType:'video/mp4'},
    {filename:'asset-002.png',mediaType:'image/png'},
  ].map(a=>({...a,bytes:fs.statSync(path.join(assetDir,a.filename)).size,
    sha256:sha(fs.readFileSync(path.join(assetDir,a.filename)))}));
  const manifestPath=path.join(root,'manifest.json');
  fs.writeFileSync(manifestPath,JSON.stringify({schema:HARBOR_SCHEMA,assets}));
  const receive=await verifyPrivateMediaImport({
    manifestPath,assetDir,expectedCount:2,operatorRef:'verified-local-operator',
  });
  const receiverReceiptPath=path.join(root,'receiver-receipt.json');
  fs.writeFileSync(receiverReceiptPath,JSON.stringify(receive),{mode:0o600});
  const operatorDecisionPath=path.join(root,'operator-review.json');
  const perAsset={
    'asset-001.mp4':{decision:'consider',rights:'owned',
      rightsEvidenceRef:'private:source-consent-video-001',
      operatorReviewRef:'private:observed-moving-subject-001',
      subjects:['synthetic-moving-pattern'],roles:['hook','proof']},
    'asset-002.png':{decision:'consider',rights:'licensed',
      rightsEvidenceRef:'private:source-consent-still-002',
      operatorReviewRef:'private:observed-still-image-002',
      subjects:['synthetic-static-pattern'],roles:['cta']},
  };
  const decisions={
    schema:'evercraft.fallen.private-operator-review.v1',
    projectId:'synthetic-customer',
    operatorRef:'private:approved-receiver-operator-001',
    excludedPreviousAssetDigests:[],
    perAsset,
  };
  fs.writeFileSync(operatorDecisionPath,JSON.stringify(decisions),{mode:0o600});
  const args={manifestPath,assetDir,receiverReceiptPath,operatorDecisionPath,
    outputDir,expectedCount:2};
  return {root,assets,receive,args,decisions,operatorDecisionPath,receiverReceiptPath};
}
const overwrite=(file,obj)=>fs.writeFileSync(file,JSON.stringify(obj));
test('real local media is probed; private contact frames, rights-scoped candidate pointers and no release',async t=>{
  const f=await fixture(t);
  const r=await qualifyPrivateHarborBatch(f.args);
  assert.equal(r.schema,QUALIFICATION_SCHEMA);
  assert.equal(r.state,'REVIEWED_SOURCE_CANDIDATES_AVAILABLE');
  assert.equal(r.assetCount,2);
  assert.equal(r.assessedSourceCount,2);
  assert.equal(r.approvedRealVideoHookDeclared,true);
  assert.equal(r.rows[0].kind,'video');
  assert.ok(r.rows[0].durationSec>1.9);
  assert.equal(r.rows[0].hasAudio,false);
  assert.equal(r.rows[1].kind,'image');
  assert.equal(r.rows[1].durationSec,null);
  assert.equal(r.sourceAssets[0].id,'source-001');
  assert.equal(r.sourceAssets[0].mediaKind,'video');
  assert.equal(r.sourceAssets[0].rights,'owned');
  assert.ok(r.sourceAssets[0].sourceRefs.some(x=>x.startsWith('private-transfer:')));
  assert.equal(r.boundaries.studioAdmissionGranted,false);
  assert.equal(r.boundaries.realVideoRendered,false);
  assert.equal(r.boundaries.customerDelivery,false);
  assert.equal(r.boundaries.publicationAuthority,false);
  for(const row of r.rows){
    const p=path.join(f.args.outputDir,row.thumbnailRelativePath);
    assert.ok(fs.statSync(p).size>1000);
    assert.equal(sha(fs.readFileSync(p)),row.thumbnailSha256);
    assert.equal(fs.statSync(p).mode&0o777,0o600);
  }
  assert.equal(fs.statSync(f.args.outputDir).mode&0o777,0o700);
  const result=JSON.parse(fs.readFileSync(path.join(f.args.outputDir,
    'private-media-qualification.json'),'utf8'));
  assert.equal(result.state,'REVIEWED_SOURCE_CANDIDATES_AVAILABLE');
  await assert.rejects(()=>qualifyPrivateHarborBatch(f.args),/output_not_empty/);
});
test('fresh receiver-side hash check rejects transfer changes and false receiver receipts',async t=>{
  const f=await fixture(t);
  const wrong={...f.receive,receiverHostname:'unknown-vendor-machine'};
  overwrite(f.receiverReceiptPath,wrong);
  await assert.rejects(()=>qualifyPrivateHarborBatch(f.args),/receiver_receipt_not_valid/);
  overwrite(f.receiverReceiptPath,f.receive);
  fs.appendFileSync(path.join(f.args.assetDir,'asset-001.mp4'),'changed after receiver receipt');
  await assert.rejects(()=>qualifyPrivateHarborBatch(f.args),/asset_size|asset_digest_mismatch/);
  assert.equal(fs.existsSync(f.args.outputDir),false);
});
test('a rejected earlier preview is not reused as a new hook',async t=>{
  const f=await fixture(t);
  f.decisions.excludedPreviousAssetDigests=[f.assets[0].sha256];
  overwrite(f.operatorDecisionPath,f.decisions);
  const r=await qualifyPrivateHarborBatch(f.args);
  assert.equal(r.state,'NEEDS_APPROVED_REAL_VIDEO_HOOK');
  assert.equal(r.approvedRealVideoHookDeclared,false);
  assert.equal(r.assessedSourceCount,1);
  assert.equal(r.rows[0].previouslyRejected,true);
  assert.equal(r.sourceAssets[0].kind,undefined);
  assert.equal(r.sourceAssets[0].mediaKind,'image');
});
test('operator rights and subject claims missing means HOLD, not automatically approved',async t=>{
  const f=await fixture(t);
  f.decisions.perAsset={};
  overwrite(f.operatorDecisionPath,f.decisions);
  const r=await qualifyPrivateHarborBatch(f.args);
  assert.equal(r.state,'NEEDS_OPERATOR_SOURCE_REVIEW');
  assert.equal(r.assessedSourceCount,0);
  assert.equal(r.rows[0].review.reason,'operator_visual_rights_review_missing');
});
test('false rights evidence and extra unrecognized review filenames are blocked',async t=>{
  const f=await fixture(t);
  f.decisions.perAsset['asset-001.mp4'].rightsEvidenceRef='';
  overwrite(f.operatorDecisionPath,f.decisions);
  await assert.rejects(()=>qualifyPrivateHarborBatch(f.args),/review_evidence_missing/);
  f.decisions.perAsset['asset-001.mp4'].rightsEvidenceRef='private:valid-rights-reference';
  f.decisions.perAsset['../private-extra.mp4']={decision:'exclude'};
  overwrite(f.operatorDecisionPath,f.decisions);
  await assert.rejects(()=>qualifyPrivateHarborBatch(f.args),/operator_review_invalid/);
});
test('symlinked media and corrupted-but-signature-valid image are not considered decodable',async t=>{
  const f=await fixture(t);
  const filename=path.join(f.args.assetDir,'asset-002.png');
  const backup=path.join(f.root,'backup.png');
  fs.copyFileSync(filename,backup);
  fs.rmSync(filename);
  fs.symlinkSync(backup,filename);
  await assert.rejects(()=>qualifyPrivateHarborBatch(f.args),/asset_not_regular/);
  fs.rmSync(filename);
  const truncated=fs.readFileSync(backup).subarray(0,25);
  fs.writeFileSync(filename,truncated);
  const bad=[f.assets[0],{...f.assets[1],bytes:truncated.length,sha256:sha(truncated)}];
  overwrite(f.args.manifestPath,{schema:HARBOR_SCHEMA,assets:bad});
  const changed=await verifyPrivateMediaImport({
    manifestPath:f.args.manifestPath,assetDir:f.args.assetDir,
    operatorRef:f.receive.operatorRef,expectedCount:2,
  });
  overwrite(f.receiverReceiptPath,changed);
  await assert.rejects(()=>qualifyPrivateHarborBatch(f.args),/ffprobe_failed|visual_not_decodable/);
});
