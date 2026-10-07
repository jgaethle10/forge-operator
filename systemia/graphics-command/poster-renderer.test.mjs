import test from 'node:test';
import assert from 'node:assert/strict';
import { renderDirectedPoster } from './poster-renderer.mjs';

const story={
  schema:'evercraft.visual-story.v1',
  slug:'volcanoes',
  title:'Washington volcanoes',
  callout:'Five volcanoes.',
  evidenceState:'reported',
  sourceRefs:['https://www.usgs.gov/volcanoes/mount-rainier'],
  points:[
    {id:'a',label:'Mount Baker',lat:48.7,lon:-121.8,value:3286,note:'Very High threat potential'},
    {id:'b',label:'Mount Rainier',lat:46.85,lon:-121.76,value:4392,note:'Very High threat potential'},
    {id:'c',label:'Mount Adams',lat:46.2,lon:-121.49,value:3742,note:'High threat potential'},
  ],
  lines:[{from:'a',to:'b'},{from:'b',to:'c'}],
};

const plan={
  schema:'evercraft.graphics-command.plan.v1',
  hero:{eyebrow:'WASHINGTON • CASCADE RANGE',hook:'5 ACTIVE VOLCANOES',subhook:'4 carry Very High threat potential'},
  metrics:[
    {label:'ACTIVE VOLCANOES',value:5,unit:''},
    {label:'VERY HIGH THREAT',value:4,unit:''},
  ],
};

test('directed poster makes visual payoff primary and removes audit clutter',()=>{
  const svg=renderDirectedPoster(story,plan,'feed');
  assert.match(svg,/width="1080" height="1350"/);
  assert.match(svg,/5 ACTIVE VOLCANOES/);
  assert.match(svg,/Mount Rainier/);
  assert.match(svg,/VERY HIGH/);
  assert.match(svg,/usgs\.gov/);
  assert.doesNotMatch(svg,/Digest/i);
  assert.doesNotMatch(svg,/Published 20/);
});

test('directed poster supports vertical story output',()=>{
  const svg=renderDirectedPoster(story,plan,'story');
  assert.match(svg,/height="1920"/);
  assert.match(svg,/WASHINGTON/);
});
