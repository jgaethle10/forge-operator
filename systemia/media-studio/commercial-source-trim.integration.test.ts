import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import {compileStudioDraft, type StudioDraftPlan} from './studio-create.js';
import {renderTimelineExport} from './timeline-export.js';

function ffmpeg(args:string[], encoding:'utf8'|null='utf8'){
  const r=spawnSync('ffmpeg',['-nostdin','-hide_banner','-v','error',...args],
    {encoding,maxBuffer:16*1024*1024});
  if(r.error||r.status!==0)throw new Error(String(r.error?.message||r.stderr||r.status));
  return r.stdout;
}
function sha(p:string){
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}
function pixel(p:string,t:number){
  const raw=ffmpeg(['-ss',String(t),'-i',p,'-frames:v','1','-vf',
    'scale=1:1:flags=area,format=rgb24','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],null);
  return Buffer.isBuffer(raw)?raw:Buffer.from(raw);
}
test('Fallen actually renders separate red/blue scenes from distinct in-points of one verified clip',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-client-source-cut-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const source=path.join(dir,'source.mp4'),master=path.join(dir,'render.mp4');
  ffmpeg(['-y',
    '-f','lavfi','-i','color=c=red:s=320x180:r=24:d=2',
    '-f','lavfi','-i','color=c=blue:s=320x180:r=24:d=2',
    '-filter_complex','[0:v][1:v]concat=n=2:v=1:a=0[v]',
    '-map','[v]','-c:v','mpeg4','-q:v','5',source]);
  const base:StudioDraftPlan={
    schema:'evercraft.fallen.studio-draft-plan.v1',
    id:'source-trim-commercial-canary',
    title:'Source Trim Commercial Canary',
    prompt:'Demonstrate deterministic source editing without synthetic video',
    aspectRatio:'16:9',
    fps:24,continuityDigest:'fixture:two-real-source-regions',
    sourceAssets:[{
      id:'verified-client-recording',path:source,digest:sha(source),
      kind:'video',rights:'owned',durationSec:4,
      sourceRefs:['fixture:owned-two-color-test'],
    }],
    scenes:[
      {id:'first',durationSec:1,
        visual:{assetId:'verified-client-recording',trimStartSec:0,
          sourceRefs:['fixture:owned-two-color-test']}},
      {id:'second',durationSec:1,
        visual:{assetId:'verified-client-recording',trimStartSec:2,
          sourceRefs:['fixture:owned-two-color-test']}},
    ],
  };
  const draft=compileStudioDraft(base);
  const clips=draft.project.tracks.find(x=>x.kind==='video')?.clips;
  assert.deepEqual(clips?.map(x=>x.trimStartSec),[0,2]);
  const receipt=renderTimelineExport({project:draft.project,outputPath:master});
  assert.equal(receipt.publicationAuthorityGranted,false);
  assert.ok(fs.statSync(master).size>1000);
  const red=pixel(master,.5),blue=pixel(master,1.5);
  assert.equal(red.length,3);
  assert.equal(blue.length,3);
  assert.ok(red[0]>150&&red[2]<100,'first scene should be visibly red');
  assert.ok(blue[2]>150&&blue[0]<100,'second scene should be visibly blue');
});
