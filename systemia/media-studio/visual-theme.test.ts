import assert from 'node:assert/strict';
import test from 'node:test';
import { buildVisualStageHtml } from './visual-stage-html.js';
import { stageDigest, type VisualStage } from './visual-stage.js';
import {
  EVERCRAFT_VISUAL_THEME_V1,
  resolveVisualTheme,
} from './visual-theme.js';
import { compileWorldIntelStage } from './world-intel-stage.js';

test('Evercraft Core v1 preserves the approved palette contract',()=>{
  const theme=EVERCRAFT_VISUAL_THEME_V1;
  assert.equal(theme.palette.background,'#080B0B');
  assert.equal(theme.palette.textPrimary,'#F5F5F2');
  assert.equal(theme.palette.titanium,'#B7BDC5');
  assert.equal(theme.palette.accentGold,'#B79A56');
  assert.equal(theme.palette.accentIce,'#4FB8FF');
  assert.equal(theme.evidence.modeled,'#B79A56');
  assert.equal(theme.evidence.public_source,'#4FB8FF');
});

test('visual-stage HTML emits theme tokens instead of hard-coded generic styling',()=>{
  const stage:VisualStage={
    schema:'evercraft.fallen.visual-stage.v1',
    id:'theme-proof',
    width:640,height:360,fps:30,durationSec:2,
    background:EVERCRAFT_VISUAL_THEME_V1.palette.background,
    theme:EVERCRAFT_VISUAL_THEME_V1,
    camera:{keyframes:[{t:0,x:0,y:0,zoom:1}]},
    layers:[
      {
        id:'metric',kind:'metric',z:1,x:20,y:20,width:300,height:140,
        label:'PUBLIC TRACKS',from:0,to:12,
        evidenceState:'public_source',sourceRefs:['source:tracks']
      },
      {
        id:'geo',kind:'geo',z:2,x:330,y:20,width:280,height:260,
        projection:'mercator',grid:true,
        routes:[{
          id:'route',points:[{lat:0,lon:0},{lat:5,lon:15}],
          evidenceState:'modeled',sourceRefs:['model:route']
        }],
        evidenceState:'modeled',sourceRefs:['model:route']
      }
    ],
    createdAt:'2026-09-27T00:00:00.000Z'
  };
  const html=buildVisualStageHtml(stage);
  assert.match(html,/#B79A56/i);
  assert.match(html,/#4FB8FF/i);
  assert.match(html,/--ev-route-observed/);
  assert.match(html,/ev-public_source/);
});

test('theme is part of the deterministic stage identity',()=>{
  const base:VisualStage={
    schema:'evercraft.fallen.visual-stage.v1',
    id:'digest-proof',
    width:320,height:180,fps:30,durationSec:1,
    background:'#080B0B',
    theme:EVERCRAFT_VISUAL_THEME_V1,
    camera:{keyframes:[{t:0,x:0,y:0,zoom:1}]},
    layers:[],
    createdAt:'2026-09-27T00:00:00.000Z'
  };
  const changed:VisualStage={
    ...base,
    theme:{
      ...EVERCRAFT_VISUAL_THEME_V1,
      id:'evercraft-core-alt',
      palette:{...EVERCRAFT_VISUAL_THEME_V1.palette,accentIce:'#00FFFF'}
    }
  };
  assert.notEqual(stageDigest(base),stageDigest(changed));
});

test('world-intelligence compiler opts into Evercraft Core by default',()=>{
  const stage=compileWorldIntelStage({
    id:'world-theme-proof',
    headline:'Global movement',
    map:{
      routes:[{
        id:'r',
        points:[{lat:0,lon:0},{lat:10,lon:20}],
        evidenceState:'public_source',
        sourceRefs:['source:r']
      }]
    }
  });
  assert.equal(stage.theme?.id,'evercraft-core-v1');
  assert.equal(resolveVisualTheme(stage.theme).palette.accentIce,'#4FB8FF');
});
