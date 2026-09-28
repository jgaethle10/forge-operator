import assert from 'node:assert/strict';
import test from 'node:test';
import {
  makeTimelineProject,
  replaceTimelineClipAsset,
  moveTimelineClip,
  trimTimelineClip,
} from './timeline.js';

const oldAsset={
  id:'shot-a-v1',path:'/tmp/a.mp4',digest:'a'.repeat(64),kind:'video' as const,
  sourceRefs:['tournament:winner-v1'],evidenceState:'synthetic_visualization' as const,
  continuityDigest:'continuity'
};
const newAsset={
  id:'shot-a-v2',path:'/tmp/b.mp4',digest:'b'.repeat(64),kind:'video' as const,
  sourceRefs:['tournament:winner-v2'],evidenceState:'synthetic_visualization' as const,
  continuityDigest:'continuity'
};

function project(){
  return makeTimelineProject({
    id:'week-in-motion',
    title:'Week in Motion',
    aspectRatio:'16:9',
    assets:[oldAsset],
    tracks:[{
      id:'video-1',kind:'video',name:'Picture',
      clips:[{
        id:'systemia-shot',trackId:'video-1',assetId:'shot-a-v1',
        startSec:12,durationSec:7,trimStartSec:0
      }]
    }]
  });
}

test('replaces one regenerated shot without moving the edit',()=>{
  const p=project();
  const result=replaceTimelineClipAsset({
    project:p,clipId:'systemia-shot',newAsset,expectedVersion:1
  });
  const clip=result.project.tracks[0].clips[0];
  assert.equal(result.project.version,2);
  assert.equal(clip.assetId,'shot-a-v2');
  assert.equal(clip.startSec,12);
  assert.equal(clip.durationSec,7);
  assert.equal(result.receipt.preserved.downstreamClipTiming,true);
  assert.equal(result.receipt.publicationAuthorityGranted,false);
});

test('uses optimistic versioning so two editors cannot silently overwrite each other',()=>{
  const p=project();
  assert.throws(()=>replaceTimelineClipAsset({
    project:p,clipId:'systemia-shot',newAsset,expectedVersion:2
  }),/timeline_version_conflict/);
});

test('supports exact clip moves and trims as reversible project mutations',()=>{
  const p=project();
  const moved=moveTimelineClip({project:p,clipId:'systemia-shot',startSec:13.5,expectedVersion:1});
  assert.equal(moved.project.tracks[0].clips[0].startSec,13.5);
  const trimmed=trimTimelineClip({
    project:moved.project,clipId:'systemia-shot',durationSec:5.5,trimStartSec:.5,expectedVersion:2
  });
  assert.equal(trimmed.project.tracks[0].clips[0].durationSec,5.5);
  assert.equal(trimmed.project.tracks[0].clips[0].trimStartSec,.5);
  assert.equal(trimmed.project.version,3);
});
