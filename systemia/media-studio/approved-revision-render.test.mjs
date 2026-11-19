import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {makeTimelineProject} from './timeline.js';
import {saveTimelineVersion,readTimelineVersion,readTimelineVersionHistory} from './timeline-version-vault.mjs';
import {startPreviewDesk,PREVIEW_DESK_SCHEMA} from './private-preview-desk.mjs';
import {proposePreviewNoteHandoff} from './preview-note-saban-handoff.mjs';
import {renderApprovedRevision,APPROVED_REVISION_RENDER_SCHEMA} from './approved-revision-render.mjs';

const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const authority='private:operator-approved-owner-assembly-fixture';
const ref='private:operator-reviewed-clip-source-fixture';
function ffmpeg(args){
  const r=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y',...args],
    {encoding:'utf8',timeout:180000,maxBuffer:5000000});
  if(r.error||r.status!==0)throw Error('fixture_ffmpeg_failed:'+String(r.stderr||r.error?.message||''));
}
function ffprobe(file){
  const r=spawnSync('ffprobe',['-v','error','-show_format','-show_streams','-of','json',file],
    {encoding:'utf8',timeout:30000});
  if(r.error||r.status!==0)throw Error('fixture_ffprobe_failed');
  return JSON.parse(r.stdout);
}
function obs(id,metric,score,threshold=.75){
  return {schema:'evercraft.fallen.visual-observation.v1',
    candidateId:id,metric,verifierId:'synthetic-ci-verifier-'+metric,
    verifierState:'verified',score,threshold,
    evidenceRefs:['synthetic-ci-evidence:'+id+':'+metric],
  };
}
function candidate({id,shotId,file,aspectRatio='16:9',beauty}){
  const score=id==='winner'?.96:.82;
  return {
    id,shotId,artifactPath:file,artifactDigest:sha(file),kind:'video',
    durationSec:2,aspectRatio,sourceState:'observed_source',
    provenance:'complete',syntheticLabelPresent:false,
    subjectIds:[],
    observations:[
      obs(id,'subject_coverage',score),
      obs(id,'composition',score),
      obs(id,'motion_quality',score),
      obs(id,'continuity',score),
      obs(id,'brand_fidelity',score),
      obs(id,'beauty',beauty),
      obs(id,'editability',.99,.9),
    ],
  };
}
test('approved existing video candidate becomes a real H264/AAC master, QC receipt and reversible v2',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-real-render-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const vaultRoot=path.join(root,'vault'),mediaRoot=path.join(root,'media'),notesRoot=path.join(root,'notes');
  fs.mkdirSync(vaultRoot,{mode:0o700});fs.mkdirSync(mediaRoot,{mode:0o700});
  const mk=(name,source)=>{
    const file=path.join(mediaRoot,name+'.mp4');
    ffmpeg(['-f','lavfi','-i',source,'-t','2','-an',
      '-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p',file]);
    return {file,digest:sha(file)};
  };
  const opening=mk('opening','testsrc2=size=640x360:rate=24');
  const oldEnding=mk('old-ending','testsrc2=size=640x360:rate=24');
  const winner=mk('winner','testsrc=size=640x360:rate=24');
  const loser=mk('loser','testsrc2=size=640x360:rate=24');
  const soundtrack=path.join(mediaRoot,'approved-operator-tone.wav');
  ffmpeg(['-f','lavfi','-i','sine=frequency=380:sample_rate=48000','-t','2',
    '-c:a','pcm_s16le',soundtrack]);
  const a=(id,info,kind='video')=>({id,path:info.file??info,digest:info.digest??sha(info),
    kind,sourceRefs:['synthetic-ci-fixture:'+id],evidenceState:'observed'});
  const project=makeTimelineProject({
    id:'synthetic-review-render-001',title:'Synthetic technical render canary',
    aspectRatio:'16:9',fps:24,
    assets:[a('intro',opening),a('old-end',oldEnding),a('source-audio',soundtrack,'audio')],
    tracks:[
      {id:'picture',kind:'video',name:'Picture',clips:[
        {id:'intro-clip',trackId:'picture',assetId:'intro',startSec:0,durationSec:.7,locked:true},
        {id:'end-clip',trackId:'picture',assetId:'old-end',startSec:.7,durationSec:.8},
      ]},
      {id:'music',kind:'music',name:'Synthetic testing tone',clips:[
        {id:'music-clip',trackId:'music',assetId:'source-audio',startSec:0,durationSec:1.5},
      ]}
    ]
  });
  const saved=saveTimelineVersion({root:vaultRoot,project,
    operatorScopeReference:authority});
  const preview=mk('preview','testsrc2=size=640x360:rate=24');
  const manifest={schema:PREVIEW_DESK_SCHEMA,projectId:project.id,previews:[{
    projectDigest:saved.projectDigest,relativeMediaPath:path.basename(preview.file),
    mediaSha256:preview.digest,privateReviewAuthorized:true,
    reviewAuthorityReference:'private:operator-approved-synthetic-preview',
    label:'Synthetic source edit'
  }]};
  const context={vaultRoot,mediaRoot,notesRoot,manifest,ownerScopeReference:authority};
  const desk=await startPreviewDesk(context);
  t.after(()=>desk.close());
  const response=await fetch(desk.url+'/notes',{method:'POST',
    headers:{'origin':new URL(desk.url).origin,'content-type':'application/json',
      'x-fallen-review':'local-action'},
    body:JSON.stringify({index:0,expectedProjectDigest:saved.projectDigest,
      note:'Keep the opening unchanged. Make the ending more exciting.'})});
  assert.equal(response.status,201);
  const {id:noteId}=await response.json();
  const proposalPacket=proposePreviewNoteHandoff({...context,noteId});
  assert.equal(proposalPacket.status,'AWAITING_OPERATOR_APPROVAL');
  const need=proposalPacket.revisionProposal.visualCandidatePlan.operations[0];
  assert.equal(need.clipId,'end-clip');
  const needId=project.id+'-end-clip-v1-regenerate';
  const tournamentInput={
    schema:'evercraft.fallen.shot-tournament-run.v1',
    needId,shotId:'end-clip',creativeGenomeDigest:'synthetic-local-fixture-genome',
    candidates:[
      candidate({id:'loser',shotId:'end-clip',file:loser.file,beauty:.79}),
      candidate({id:'winner',shotId:'end-clip',file:winner.file,beauty:.95}),
    ],
  };
  const args={
    context,noteId,proposalPacket,expectedBridgeDigest:proposalPacket.bridgeDigest,
    operatorApprovalReference:'private:separate-operator-stage-approval',
    tournamentInput,winnerRelativeMediaPath:path.basename(winner.file),
    operatorRightsRefs:['private:operator-rights-assertion-synthetic-fixture'],
    operatorVisualReviewRefs:['private:operator-visual-review-assertion-fixture'],
    snapshotScopeReference:authority,
    outputDir:path.join(root,'private-master'),
  };
  await t.test('refuse unapproved sources, swapped media and tournament linkage before rendering',async()=>{
    const historyBefore=readTimelineVersionHistory({root:vaultRoot,projectId:project.id});
    await assert.rejects(()=>renderApprovedRevision({...args,operatorRightsRefs:[]}),/owner_rights_or_review_missing/);
    await assert.rejects(()=>renderApprovedRevision({...args,winnerRelativeMediaPath:path.basename(loser.file)}),
      /tournament_file_not_bound|candidate_sha_mismatch/);
    await assert.rejects(()=>renderApprovedRevision({...args,tournamentInput:{...tournamentInput,
      needId:'other-need'}}),/tournament_scope_mismatch/);
    const withoutEvidence={...tournamentInput,candidates:tournamentInput.candidates.map(c=>({
      ...c,observations:c.observations.filter(x=>x.metric!=='editability')
    }))};
    await assert.rejects(()=>renderApprovedRevision({...args,tournamentInput:withoutEvidence}),
      /tournament_not_selected/);
    const historyAfter=readTimelineVersionHistory({root:vaultRoot,projectId:project.id});
    assert.deepEqual(historyAfter,historyBefore);
    assert.equal(fs.existsSync(args.outputDir),false);
  });
  await t.test('dry run produces gated plan and preserves the live project',async()=>{
    const planned=await renderApprovedRevision({...args,dryRun:true});
    assert.equal(planned.status,'READY_TO_RENDER_NOT_YET_EXECUTED');
    assert.equal(planned.clipId,'end-clip');
    assert.equal(planned.sourceProjectDigest,saved.projectDigest);
    assert.equal(readTimelineVersion({root:vaultRoot,projectId:project.id}).version,1);
    assert.equal(fs.existsSync(args.outputDir),false);
  });
  await t.test('real render is technically accepted before v2 is saved and old cut remains intact',async()=>{
    const receipt=await renderApprovedRevision(args);
    assert.equal(receipt.schema,APPROVED_REVISION_RENDER_SCHEMA);
    assert.equal(receipt.status,'PRIVATE_RENDER_TECHNICALLY_ACCEPTED_PENDING_HUMAN_REVIEW');
    assert.equal(receipt.fromVersion,1);
    assert.equal(receipt.toVersion,2);
    assert.equal(receipt.changedClipId,'end-clip');
    assert.equal(receipt.newClipAssetDigest,winner.digest);
    assert.equal(receipt.unchangedClipTiming,true);
    assert.equal(receipt.boundaries.noPublicationAuthority,true);
    assert.equal(receipt.boundaries.noCustomerDelivery,true);
    assert.equal(sha(receipt.encodedMediaPath),receipt.encodedMediaSha256);
    const media=ffprobe(receipt.encodedMediaPath);
    const video=media.streams.find(s=>s.codec_type==='video');
    const audio=media.streams.find(s=>s.codec_type==='audio');
    assert.equal(video.codec_name,'h264');
    assert.equal(audio.codec_name,'aac');
    assert.ok(Number(media.format.duration)>1.3);
    const old=readTimelineVersion({root:vaultRoot,projectId:project.id,
      projectDigest:saved.projectDigest});
    const revised=readTimelineVersion({root:vaultRoot,projectId:project.id});
    assert.equal(old.tracks[0].clips[1].assetId,'old-end');
    assert.equal(revised.tracks[0].clips[0].assetId,'intro');
    assert.equal(revised.tracks[0].clips[0].locked,true);
    assert.ok(revised.tracks[0].clips[1].assetId.startsWith('reviewed-winner-'));
    assert.equal(revised.tracks[0].clips[1].startSec,.7);
    assert.equal(revised.tracks[0].clips[1].durationSec,.8);
    assert.equal(readTimelineVersionHistory({root:vaultRoot,projectId:project.id}).entries.length,2);
    assert.equal(fs.statSync(receipt.encodedMediaPath).mode&0o777,0o600);
    const master=JSON.parse(fs.readFileSync(receipt.masterQcReceiptPath,'utf8'));
    assert.equal(master.status,'accepted');
    assert.equal(master.sha256,receipt.encodedMediaSha256);
    const clip=JSON.parse(fs.readFileSync(path.join(args.outputDir,
      'fallen-private-revision-'+noteId+'.clip-intake.json'),'utf8'));
    assert.equal(clip.media.sha256,receipt.encodedMediaSha256);
    assert.equal(clip.boundaries.publicationAuthorityGranted,false);
    const out=process.env.FALLEN_REVISION_PROOF_DIR;
    if(out){
      fs.mkdirSync(out,{recursive:true});
      for(const filename of [receipt.encodedMediaPath,receipt.masterQcReceiptPath,
        receipt.renderReceiptPath,path.join(args.outputDir,'private-revision-render-receipt.json')]){
        fs.copyFileSync(filename,path.join(out,path.basename(filename)));
      }
      fs.writeFileSync(path.join(out,'SYNTHETIC_ONLY.txt'),
        'CI synthetic test pattern and oscillator. This is technical encoding proof, not licensed customer footage, creative approval or published video.\n');
    }
  });
  await t.test('stale note cannot turn into a second changed version or overwrite master',async()=>{
    await assert.rejects(()=>renderApprovedRevision({...args,dryRun:true}),/stale_head/);
    assert.equal(readTimelineVersionHistory({root:vaultRoot,projectId:project.id}).entries.length,2);
  });
});
