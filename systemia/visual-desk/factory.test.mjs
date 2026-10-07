import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildVisualStory,
  normalizeVisualStory,
  renderShareCard,
  renderCardVariant,
  renderMotionStage,
} from './factory.mjs';

const fixture={
  schema:'evercraft.visual-story.v1',
  slug:'cascade-test',
  title:'A visual story should become an owned page in one build',
  subtitle:'Source-backed geography with a share card and a Clip handoff.',
  narrative:'This fixture proves the mechanics without publishing a factual public story.',
  callout:'Visual first. Evidence attached. Owned URL.',
  evidenceState:'modeled',
  sourceRefs:['https://example.com/source-a','https://example.org/source-b'],
  publishedAt:'2026-10-06T23:00:00.000Z',
  points:[
    {id:'a',label:'Yakima',lat:46.6021,lon:-120.5059,value:20},
    {id:'b',label:'Seattle',lat:47.6062,lon:-122.3321,value:35},
    {id:'c',label:'Portland',lat:45.5152,lon:-122.6784,value:15},
  ],
  lines:[
    {from:'a',to:'b'},
    {from:'a',to:'c'},
  ],
};

test('normalizes and binds story identity to its evidence',()=>{
  const story=normalizeVisualStory(fixture);
  assert.equal(story.slug,'cascade-test');
  assert.equal(story.evidenceState,'modeled');
  assert.equal(story.sourceRefs.length,2);
  assert.match(story.digest,/^[a-f0-9]{64}$/);
});

test('fails closed without sources',()=>{
  assert.throws(
    ()=>normalizeVisualStory({...fixture,sourceRefs:[]}),
    /visual_story_sources_missing/
  );
});

test('renders feed, square and vertical story assets from one story',()=>{
  const feed=renderShareCard(fixture);
  const square=renderCardVariant(fixture,'square');
  const story=renderCardVariant(fixture,'story');
  assert.match(feed,/width="1080"/);
  assert.match(feed,/height="1350"/);
  assert.match(square,/height="1080"/);
  assert.match(story,/height="1920"/);
  assert.match(story,/THE WORLD, MADE LEGIBLE/);
  assert.match(feed,/MODELED/);
  assert.match(feed,/Yakima/);
});

test('motion stage exposes deterministic exact-time render controls',()=>{
  const html=renderMotionStage(fixture);
  assert.match(html,/__evercraftRenderAt/);
  assert.match(html,/__evercraftRenderFrame/);
  assert.match(html,/deterministic/);
  assert.match(html,/publicationAuthority/);
});

test('build emits owned page, social card, manifest and Clip handoff',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-visual-desk-'));
  try{
    const result=buildVisualStory(fixture,{
      outputRoot:root,
      origin:'https://visuals.evercraft.test',
    });

    const files=fs.readdirSync(result.outputDir).sort();
    assert.deepEqual(files,[
      'card-feed.svg',
      'card-square.svg',
      'card-story.svg',
      'card.svg',
      'clip-handoff.json',
      'fallen-stage-input.json',
      'graphics-plan.json',
      'index.html',
      'manifest.json',
      'motion.html',
      'poster-feed.svg',
      'poster-square.svg',
      'poster-story.svg',
      'scroll-stop-report.json',
      'story.json',
    ]);

    const html=fs.readFileSync(path.join(result.outputDir,'index.html'),'utf8');
    const manifest=JSON.parse(fs.readFileSync(path.join(result.outputDir,'manifest.json'),'utf8'));
    const handoff=JSON.parse(fs.readFileSync(path.join(result.outputDir,'clip-handoff.json'),'utf8'));

    assert.match(html,/og:image/);
    assert.match(html,/visuals\.evercraft\.test\/cascade-test/);
    assert.equal(manifest.canonicalUrl,'https://visuals.evercraft.test/cascade-test/');
    assert.equal(manifest.schema,'evercraft.visual-story.manifest.v3');
    assert.match(manifest.socialCardUrl,/poster-feed\.svg$/);
    assert.equal(manifest.scrollStopStatus,'pass');
    assert.match(manifest.assets.motionStage,/motion\.html$/);
    assert.equal(handoff.publicationAuthority,false);
    assert.equal(handoff.schema,'evercraft.visual-story.clip-handoff.v3');
    assert.match(handoff.preferredAssetByDestination.tiktok,/poster-story\.svg$/);
    const plan=JSON.parse(fs.readFileSync(path.join(result.outputDir,'graphics-plan.json'),'utf8'));
    const gate=JSON.parse(fs.readFileSync(path.join(result.outputDir,'scroll-stop-report.json'),'utf8'));
    const fallen=JSON.parse(fs.readFileSync(path.join(result.outputDir,'fallen-stage-input.json'),'utf8'));
    assert.equal(plan.hero.visualPriority,'hero_first');
    assert.equal(gate.status,'pass');
    assert.equal(fallen.aspectRatio,'9:16');
    assert.match(html,/poster-feed\.svg/);
    assert.match(html,/Sources &amp; methodology/);
    assert.deepEqual(handoff.suggestedDestinations,['facebook','instagram','linkedin','tiktok']);
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});
