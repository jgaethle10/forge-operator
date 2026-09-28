import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStageHtml } from './runtime.mjs';

test('private renderer honors stage theme tokens',()=>{
  const theme={
    schema:'evercraft.fallen.visual-theme.v1',
    id:'worker-theme-proof',
    fontFamily:'Arial, sans-serif',
    palette:{
      background:'#010203',
      surface:'#111111',
      surfaceRaised:'#222222',
      textPrimary:'#FAFAFA',
      textSecondary:'#BBBBBB',
      titanium:'#BBBBBB',
      accentGold:'#A07A33',
      accentIce:'#22AAFF',
      grid:'rgba(1,2,3,.2)',
      routeObserved:'#22AAFF',
      routeModeled:'#A07A33',
      point:'#FAFAFA',
      timelineRail:'rgba(250,250,250,.2)',
      timelinePlayhead:'#22AAFF'
    },
    evidence:{
      observed:'#FAFAFA',
      public_source:'#22AAFF',
      licensed:'#BBBBBB',
      modeled:'#A07A33',
      inferred:'#A07A33',
      synthetic_visualization:'#A07A33'
    }
  };
  const html=buildStageHtml({
    schema:'evercraft.fallen.visual-stage.v1',
    id:'worker-theme-stage',
    width:320,height:180,fps:30,durationSec:1,
    background:'#010203',
    theme,
    camera:{keyframes:[{t:0,x:0,y:0,zoom:1}]},
    layers:[{
      id:'metric',kind:'metric',z:1,x:0,y:0,width:200,height:100,
      label:'TEST',from:0,to:1
    }],
    createdAt:'2026-09-27T00:00:00.000Z'
  });
  assert.match(html,/#22AAFF/i);
  assert.match(html,/#A07A33/i);
  assert.match(html,/--ev-text-secondary/);
});
