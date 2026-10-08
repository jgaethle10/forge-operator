import assert from 'node:assert/strict';
import crypto from 'node:crypto';
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
  assert.match(html,/evercraft\.visual-story\.motion-stage\.v2/);
  assert.match(html,/\.story-route/);
  assert.doesNotMatch(html,/EVERCRAFT VISUAL DESK<\/div>/);
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
      'poster-feed.html',
      'poster-feed.svg',
      'poster-quality-report.json',
      'poster-square.html',
      'poster-square.svg',
      'poster-story.html',
      'poster-story.svg',
      'scroll-stop-report.json',
      'shot-balanced-relief-feed.html',
      'shot-balanced-relief-feed.svg',
      'shot-balanced-relief-story.html',
      'shot-balanced-relief-story.svg',
      'shot-cascade-signal-feed.html',
      'shot-cascade-signal-feed.svg',
      'shot-cascade-signal-story.html',
      'shot-cascade-signal-story.svg',
      'shot-terrain-hero-feed.html',
      'shot-terrain-hero-feed.svg',
      'shot-terrain-hero-story.html',
      'shot-terrain-hero-story.svg',
      'shot-tournament.json',
      'story.json',
    ]);

    const html=fs.readFileSync(path.join(result.outputDir,'index.html'),'utf8');
    const manifest=JSON.parse(fs.readFileSync(path.join(result.outputDir,'manifest.json'),'utf8'));
    const handoff=JSON.parse(fs.readFileSync(path.join(result.outputDir,'clip-handoff.json'),'utf8'));
    const tournament=JSON.parse(fs.readFileSync(path.join(result.outputDir,'shot-tournament.json'),'utf8'));

    assert.match(html,/og:image/);
    assert.match(html,/visuals\.evercraft\.test\/cascade-test/);
    assert.equal(manifest.canonicalUrl,'https://visuals.evercraft.test/cascade-test/');
    assert.equal(manifest.schema,'evercraft.visual-story.manifest.v3');
    assert.match(manifest.socialCardUrl,/poster-feed\.svg$/);
    assert.equal(manifest.scrollStopStatus,'pass');
    assert.equal(manifest.posterQualityStatus,'pass');
    assert.equal(manifest.shotTournamentWinnerId,'terrain-hero');
    assert.match(manifest.shotTournamentDigest,/^[a-f0-9]{64}$/);
    assert.match(manifest.assets.posterQualityReport,/poster-quality-report\.json$/);
    assert.match(manifest.assets.shotTournamentReport,/shot-tournament\.json$/);
    assert.match(manifest.assets.shotCandidates['terrain-hero'].feed,/shot-terrain-hero-feed\.svg$/);
    assert.match(manifest.assets.shotCandidates['terrain-hero'].feedPreview,/shot-terrain-hero-feed\.html$/);
    assert.match(manifest.assets.shotCandidates['terrain-hero'].storyPreview,/shot-terrain-hero-story\.html$/);
    assert.match(manifest.assets.motionStage,/motion\.html$/);
    assert.equal(handoff.publicationAuthority,false);
    assert.equal(handoff.schema,'evercraft.visual-story.clip-handoff.v3');
    assert.equal(handoff.shotTournamentWinnerId,'terrain-hero');
    assert.equal(handoff.shotTournamentDigest,manifest.shotTournamentDigest);
    assert.match(handoff.preferredAssetByDestination.tiktok,/poster-story\.svg$/);
    const plan=JSON.parse(fs.readFileSync(path.join(result.outputDir,'graphics-plan.json'),'utf8'));
    const gate=JSON.parse(fs.readFileSync(path.join(result.outputDir,'scroll-stop-report.json'),'utf8'));
    const fallen=JSON.parse(fs.readFileSync(path.join(result.outputDir,'fallen-stage-input.json'),'utf8'));
    const quality=JSON.parse(fs.readFileSync(path.join(result.outputDir,'poster-quality-report.json'),'utf8'));
    assert.equal(plan.hero.visualPriority,'hero_first');
    assert.equal(quality.status,'pass');
    assert.equal(quality.shotTournamentWinnerId,'terrain-hero');
    assert.equal(quality.shotTournamentDigest,tournament.digest);
    assert.equal(tournament.schema,'evercraft.graphics-command.shot-tournament.v1');
    assert.equal(tournament.winnerId,'terrain-hero');
    assert.equal(tournament.candidateCount,3);
    assert.equal(tournament.humanReviewRequired,true);
    assert.equal(quality.formats.feed.status,'pass');
    assert.equal(quality.formats.square.status,'pass');
    assert.equal(quality.formats.story.status,'pass');
    assert.equal(gate.status,'pass');
    assert.equal(fallen.aspectRatio,'9:16');
    assert.match(html,/poster-feed\.svg/);
    assert.match(html,/Sources &amp; methodology/);
    assert.match(html,/poster-story\.html/);
    assert.doesNotMatch(html,/Digest [a-f0-9]{12}/);
    const preview=fs.readFileSync(path.join(result.outputDir,'poster-story.html'),'utf8');
    assert.match(preview,/max-height:calc\(100svh - 58px\)/);
    assert.match(preview,/poster-story\.svg/);
    assert.deepEqual(handoff.suggestedDestinations,['facebook','instagram','linkedin','tiktok']);
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});


test('terrain-backed specimen copies the governed relief asset with exact lineage',()=>{
  const raw=JSON.parse(fs.readFileSync(
    new URL('./stories/washington-active-volcanoes.json',import.meta.url),
    'utf8'
  ));
  const receipt=JSON.parse(fs.readFileSync(
    new URL('../graphics-command/assets/washington-usgs-shaded-relief.receipt.json',import.meta.url),
    'utf8'
  ));
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-visual-terrain-'));
  try{
    const result=buildVisualStory(raw,{outputRoot:root,origin:'https://visuals.evercraft.test'});
    const reliefPath=path.join(result.outputDir,'terrain-relief.png');
    assert.equal(fs.existsSync(reliefPath),true);
    const digest=crypto.createHash('sha256').update(fs.readFileSync(reliefPath)).digest('hex');
    assert.equal(digest,receipt.sha256);
    assert.equal(result.graphicsPlan.geography?.terrain?.id,'usgs-wa-shaded-relief-3dep-v1');
    assert.equal(result.graphicsPlan.geography?.terrain?.rightsState,'public_domain');
    assert.match(result.manifest.assets.terrainRelief,/terrain-relief\.png$/);
    const poster=fs.readFileSync(path.join(result.outputDir,'poster-feed.svg'),'utf8');
    assert.match(poster,/data-visual-model="cinematic-terrain-geography-v3"/);
    assert.match(poster,/class="terrain-relief"/);
    assert.match(poster,/href="data:image\/png;base64,/);
    const embedded=poster.match(/href="data:image\/png;base64,([^"]+)"/);
    assert.ok(embedded?.[1]);
    const embeddedDigest=crypto.createHash('sha256').update(Buffer.from(embedded[1],'base64')).digest('hex');
    assert.equal(embeddedDigest,receipt.sha256);
    assert.match(poster,new RegExp('data-source-sha256="'+receipt.sha256+'"'));
    assert.match(poster,/data-shot-strategy="terrain-hero"/);
    assert.doesNotMatch(poster,/class="peak-halo"/);
    const candidate=fs.readFileSync(path.join(result.outputDir,'shot-terrain-hero-feed.svg'),'utf8');
    assert.match(candidate,/data-shot-strategy="terrain-hero"/);
    assert.match(candidate,/href="\.\/terrain-relief\.png"/);
    assert.doesNotMatch(candidate,/href="data:image\/png;base64,/);
    const preview=fs.readFileSync(path.join(result.outputDir,'shot-terrain-hero-feed.html'),'utf8');
    assert.match(preview,/shot-terrain-hero-feed\.svg/);
    assert.match(preview,/4:5 review surface/);
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});
