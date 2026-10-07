import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startFabricLocalRuntime } from '../mcp/fabric-local-runtime.mjs';
import {
  transportVisualOutbox,
  visualStoryTransportDigest,
} from './transporter.mjs';

const catalog=[{
  public_id:'visual-transport-test-v1',
  name:'Visual Transport Test',
  description:'Test-only Fabric capability.',
  keywords:['visual'],
  state:'available',
  connections:[],
}];

function fixtureStory(){
  return {
    schema:'evercraft.visual-story.v1',
    slug:'radar-transport-test',
    title:'A source-backed spatial signal crossed the visual gate',
    subtitle:'NEW • OBSERVED • Radar visual priority 0.812',
    narrative:'This fixture proves the authenticated Radar-to-Fabric materialization boundary.',
    callout:'Two geolocated source measurements.',
    evidenceState:'observed',
    sourceRefs:['https://example.gov/feed','https://example.gov/event-a'],
    points:[
      {id:'a',label:'North',lat:47.5,lon:-122.2,value:5.8,note:'M5.8'},
      {id:'b',label:'South',lat:45.7,lon:-121.9,value:5.3,note:'M5.3'},
    ],
    lines:[],
    brand:'Evercraft Visual Desk',
    publishedAt:'2026-10-07T02:00:00.000Z',
  };
}

function writeOutbox(root,story){
  const outbox=path.join(root,'visual-desk-outbox');
  fs.mkdirSync(outbox,{recursive:true});
  const digest=visualStoryTransportDigest(story);
  fs.writeFileSync(path.join(outbox,story.slug+'.json'),JSON.stringify(story,null,2)+'\n');
  const index={
    schema:'evercraft.visual-desk.radar-outbox-index.v1',
    source_edition_id:'radar-edition:transport-test',
    generated_at:'2026-10-07T02:00:00.000Z',
    story_count:1,
    stories:[{
      slug:story.slug,
      title:story.title,
      file:story.slug+'.json',
      candidate_id:'visual-radar:test',
      source_edition_id:'radar-edition:transport-test',
      source_signal_id:'radar:test',
      source_observation_id:'ctxobs:test',
      visual_priority_score:0.812,
      score_factors:{materiality:0.8},
      story_sha256:digest,
      source_refs:story.sourceRefs,
      publicationAuthority:false,
    }],
    publicationAuthority:false,
  };
  const indexPath=path.join(outbox,'index.json');
  fs.writeFileSync(indexPath,JSON.stringify(index,null,2)+'\n');
  return {outbox,index,indexPath,digest};
}

test('authenticated transporter materializes one Radar story into Fabric and dedupes exact replay',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'visual-transport-'));
  const visualStateDir=path.join(root,'fabric-visuals');
  const token='v'.repeat(64);
  const story=fixtureStory();
  const {indexPath,digest}=writeOutbox(root,story);
  const runtime=await startFabricLocalRuntime({
    host:'127.0.0.1',
    port:0,
    catalog,
    visualStateDir,
    visualOrigin:'https://fabric.example.test/visuals',
    visualIngestToken:token,
    faieSurfaceEnabled:false,
  });

  try{
    const health=await fetch(runtime.url+'/health').then((r)=>r.json());
    assert.equal(health.visual_desk_ingest_ready,true);
    assert.equal(health.visual_desk_ingest_path,'/api/visuals/ingest');
    assert.equal(health.visual_desk_ingest_publication_authority,false);

    const unauth=await fetch(runtime.url+'/api/visuals/ingest',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:'{}',
    });
    assert.equal(unauth.status,401);
    assert.equal((await unauth.json()).error,'visual_ingest_unauthorized');

    const first=await transportVisualOutbox({
      indexPath,
      endpoint:runtime.url+'/api/visuals/ingest',
      token,
    });
    assert.equal(first.status,'pass');
    assert.equal(first.delivered,1);
    assert.equal(first.failed,0);
    assert.equal(first.results[0].status,'materialized');
    assert.equal(first.results[0].story_sha256,digest);
    assert.equal(first.publicationAuthority,false);
    assert.equal(first.external_social_publish_performed,false);

    const page=await fetch(runtime.url+'/visuals/'+story.slug+'/');
    assert.equal(page.status,200);
    assert.match(await page.text(),/source-backed spatial signal/i);

    const catalogBody=await fetch(runtime.url+'/visuals/index.json').then((r)=>r.json());
    assert.ok(catalogBody.count>=2);
    assert.ok(catalogBody.stories.some((row)=>row.slug===story.slug&&row.storyDigest===digest));

    const second=await transportVisualOutbox({
      indexPath,
      endpoint:runtime.url+'/api/visuals/ingest',
      token,
    });
    assert.equal(second.status,'pass');
    assert.equal(second.results[0].status,'deduped');
    assert.equal(second.results[0].story_sha256,digest);
  }finally{
    await runtime.close();
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('transporter fails closed on story tampering before Fabric ingest',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'visual-transport-tamper-'));
  try{
    const story=fixtureStory();
    const {outbox,indexPath}=writeOutbox(root,story);
    story.title='Tampered after admission';
    fs.writeFileSync(path.join(outbox,story.slug+'.json'),JSON.stringify(story,null,2)+'\n');

    let calls=0;
    const receipt=await transportVisualOutbox({
      indexPath,
      endpoint:'https://fabric.example.test/api/visuals/ingest',
      token:'t'.repeat(64),
      fetchImpl:async()=>{
        calls+=1;
        throw new Error('must not reach network after digest mismatch');
      },
    });
    assert.equal(receipt.status,'partial');
    assert.equal(receipt.failed,1);
    assert.equal(receipt.results[0].error,'visual_transport_story_digest_mismatch');
    assert.equal(calls,0);
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});
