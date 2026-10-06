import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildVisualStory,
  normalizeVisualStory,
  renderShareCard,
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

test('renders a 1080x1350 branded social card',()=>{
  const svg=renderShareCard(fixture);
  assert.match(svg,/width="1080"/);
  assert.match(svg,/height="1350"/);
  assert.match(svg,/EVERCRAFT VISUAL DESK/);
  assert.match(svg,/MODELED/);
  assert.match(svg,/Yakima/);
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
      'card.svg',
      'clip-handoff.json',
      'index.html',
      'manifest.json',
      'story.json',
    ]);

    const html=fs.readFileSync(path.join(result.outputDir,'index.html'),'utf8');
    const manifest=JSON.parse(fs.readFileSync(path.join(result.outputDir,'manifest.json'),'utf8'));
    const handoff=JSON.parse(fs.readFileSync(path.join(result.outputDir,'clip-handoff.json'),'utf8'));

    assert.match(html,/og:image/);
    assert.match(html,/visuals\.evercraft\.test\/cascade-test/);
    assert.equal(manifest.canonicalUrl,'https://visuals.evercraft.test/cascade-test/');
    assert.equal(handoff.publicationAuthority,false);
    assert.deepEqual(handoff.suggestedDestinations,['facebook','instagram','linkedin','tiktok']);
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});
