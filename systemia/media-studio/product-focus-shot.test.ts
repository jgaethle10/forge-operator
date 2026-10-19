import assert from 'node:assert/strict';
import test from 'node:test';
import { compileProductFocusShot, planProductSourceWindow } from './product-focus-shot.js';
import { validateStage } from './visual-stage.js';
import { buildVisualStageHtml } from './visual-stage-html.js';

const source={
  id:'relay-conflict-portrait',
  sourcePath:'asset://relay-demo-conflict',
  sourceRefs:['relay:2026-10-19:pilot-capture-sha256'],
  sourceKind:'image' as const,
  sourceWidth:1440,
  sourceHeight:2408,
  // Real UI screenshot subregion enclosing two accounts and the mismatch.
  focus:{x:450,y:1260,width:910,height:480},
  title:'One meeting. Two interpretations.',
  caption:'Relay surfaces the conflicting milestone for human review.',
  evidenceLabel:'PRIVATE PILOT | FICTIONAL MEETING',
  format:'portrait' as const,
  durationSec:5,
};

test('compiles an actual vertical product closeup with native source-pixel crop',()=>{
  const shot=compileProductFocusShot(source);
  assert.equal(shot.status,'candidate_requires_visual_review');
  assert.equal(shot.stage.width,1080);
  assert.equal(shot.stage.height,1920);
  assert.equal(validateStage(shot.stage).status,'accepted');
  const layer=shot.stage.layers.find(item=>item.id==='product-evidence');
  assert.ok(layer?.kind==='media'&&layer.sourceWindow);
  if(layer?.kind!=='media'||!layer.sourceWindow) return;
  assert.equal(layer.sourcePath,source.sourcePath);
  assert.ok(shot.evidence.focusAreaFraction>=.27);
  assert.ok(Math.abs(layer.sourceWindow.width/layer.sourceWindow.height-layer.width/layer.height)<.001);
  assert.equal(shot.evidence.sourcePixelsNotInvented,true);
  assert.equal(shot.evidence.noCreativeOrPublicationAuthority,true);
  assert.equal(shot.evidence.pixelLegibilityNotAutomaticallyVerified,true);
});

test('exact crop markup magnifies real UI content instead of shrinking desktop into black bars',()=>{
  const shot=compileProductFocusShot(source);
  const html=buildVisualStageHtml(shot.stage);
  assert.match(html,/data-layer="product-evidence"/);
  assert.match(html,/position:absolute;max-width:none;left:-/);
  assert.match(html,/PRIVATE PILOT/);
  assert.match(html,/__evercraftRenderFrame/);
  assert.doesNotMatch(html,/https:\/\//);
});

test('the compiler supports square and landscape variants with independent crops',()=>{
  for(const format of ['square','landscape'] as const){
    const shot=compileProductFocusShot({...source,id:'relay-'+format,format});
    assert.equal(validateStage(shot.stage).status,'accepted');
    assert.equal(shot.evidence.target,format);
    assert.ok(shot.evidence.focusAreaFraction>.27);
  }
});

test('an oversized subject fails closed instead of being silently cropped',()=>{
  assert.throws(()=>planProductSourceWindow({
    sourceWidth:1440,sourceHeight:2408,
    focus:{x:0,y:0,width:1440,height:2408},
    displayWidth:1010,displayHeight:1260,
  }),/product_focus_cannot_fit_source/);
});

test('tiny subjects and irrelevant wide shots cannot pass prominence floor',()=>{
  assert.throws(()=>planProductSourceWindow({
    sourceWidth:1440,sourceHeight:2408,
    focus:{x:450,y:1200,width:820,height:100},
    displayWidth:1010,displayHeight:1260,
    minimumFocusFraction:.45,
  }),/product_focus_too_small_for_format/);
});

test('no unsupported footage, missing provenance or missing editorial truth label can be packaged',()=>{
  assert.throws(()=>compileProductFocusShot({...source,sourceRefs:[]}),/product_focus_provenance_missing/);
  assert.throws(()=>compileProductFocusShot({...source,evidenceLabel:''}),/product_focus_editorial_copy_missing/);
  assert.throws(()=>compileProductFocusShot({...source,sourceWidth:0}),/product_focus_geometry_invalid/);
});

test('invalid crop with distortion or out-of-source bounds is rejected by native stage validator',()=>{
  const shot=compileProductFocusShot(source);
  const layer=shot.stage.layers.find(item=>item.id==='product-evidence');
  if(layer?.kind!=='media'||!layer.sourceWindow) throw new Error('media_layer_missing');
  const bad=structuredClone(shot.stage);
  const item=bad.layers.find(x=>x.id==='product-evidence');
  if(item?.kind!=='media'||!item.sourceWindow) throw new Error('media_layer_missing');
  item.sourceWindow.width*=2;
  assert.ok(validateStage(bad).errors.includes('media_source_window_invalid:product-evidence'));
});

test('camera directs attention from structured contradiction to human confirmation within the same real screenshot',()=>{
  const shot=compileProductFocusShot({
    ...source,id:'relay-alignment-to-decision',durationSec:6,
    focusPath:[
      {t:0,focus:source.focus,action:'Show participants interpreting the same date differently'},
      {t:3,focus:{x:520,y:1490,width:690,height:300},action:'Move attention to the flagged conflict',ease:'ease_in_out'},
      {t:6,focus:{x:520,y:1870,width:690,height:300},action:'Reveal the human confirmation form',ease:'ease_in_out'},
    ]
  });
  assert.equal(validateStage(shot.stage).status,'accepted');
  const layer=shot.stage.layers.find(item=>item.id==='product-evidence');
  assert.ok(layer?.kind==='media');
  if(layer?.kind!=='media') return;
  assert.equal(layer.sourceWindowKeyframes?.length,3);
  assert.equal(shot.evidence.cameraStops,3);
  assert.deepEqual(shot.evidence.cameraIntent,[
    'Show participants interpreting the same date differently',
    'Move attention to the flagged conflict',
    'Reveal the human confirmation form',
  ]);
  assert.equal(layer.scale,1);
  const html=buildVisualStageHtml(shot.stage);
  assert.match(html,/mediaWindowAt/);
  assert.match(html,/setMediaWindow/);
  assert.match(html,/sourceWindowKeyframes/);
  assert.match(html,/querySelector\('img,video'\)/);
});

test('camera path must start at the nominated source focus and finish on time',()=>{
  const shot={...source,durationSec:6};
  const badStart=[{t:0,focus:{x:500,y:1300,width:800,height:450},action:'Wrong initial frame'},
    {t:6,focus:source.focus,action:'End'}];
  assert.throws(()=>compileProductFocusShot({...shot,focusPath:badStart}),/initial_focus_mismatch/);
  assert.throws(()=>compileProductFocusShot({...shot,focusPath:[
    {t:0,focus:source.focus,action:'Start'},
    {t:5.5,focus:{x:520,y:1870,width:690,height:300},action:'End'}
  ]}),/camera_path_invalid/);
});

test('camera requires meaningful movement, truthful action labels and contained source windows',()=>{
  assert.throws(()=>compileProductFocusShot({...source,focusPath:[
    {t:0,focus:source.focus,action:'Start'},
    {t:5,focus:source.focus,action:'Stop'}
  ]}),/camera_no_attention_change/);
  assert.throws(()=>compileProductFocusShot({...source,focusPath:[
    {t:0,focus:source.focus,action:'Start'},
    {t:5,focus:{x:1390,y:2000,width:400,height:500},action:'Outside image'}
  ]}),/product_focus_geometry_invalid/);
  assert.throws(()=>compileProductFocusShot({...source,focusPath:[
    {t:0,focus:source.focus,action:'Start'},
    {t:5,focus:{x:520,y:1870,width:690,height:300},action:''}
  ]}),/camera_waypoint_invalid/);
});

test('native stage rejects unsafe source-camera keyframes without accepting misleading output',()=>{
  const shot=compileProductFocusShot({
    ...source,focusPath:[
      {t:0,focus:source.focus,action:'Start'},
      {t:5,focus:{x:520,y:1870,width:690,height:300},action:'Decision'},
    ]
  });
  const bad=structuredClone(shot.stage);
  const layer=bad.layers.find(x=>x.id==='product-evidence');
  if(layer?.kind!=='media'||!layer.sourceWindowKeyframes) throw new Error('camera_layer_missing');
  layer.sourceWindowKeyframes[1].x=999999;
  assert.ok(validateStage(bad).errors.includes('media_source_camera_keyframe_invalid:product-evidence'));
});

test('critical product labels must be fully visible at nominated moments',()=>{
  const config={
    ...source,durationSec:6,
    focusPath:[
      {t:0,focus:source.focus,action:'Establish the comparison'},
      {t:3,focus:{x:520,y:1490,width:690,height:300},action:'Reveal the contradiction',ease:'ease_in_out' as const},
      {t:6,focus:{x:520,y:1870,width:690,height:300},action:'Reveal human approval',ease:'ease_in_out' as const},
    ]
  };
  const accepted=compileProductFocusShot({...config,protectedRegions:[
    {id:'comparison',t:0,region:{x:450,y:1300,width:880,height:280}},
    {id:'warning',t:3,region:{x:520,y:1510,width:650,height:230}},
    {id:'approval',t:6,region:{x:520,y:2010,width:650,height:240}},
  ]});
  assert.equal(accepted.evidence.protectedRegionChecks,3);
  assert.throws(()=>compileProductFocusShot({...config,protectedRegions:[
    {id:'important-label-cut',t:6,region:{x:1200,y:1950,width:200,height:180}}
  ]}),/product_focus_protected_region_clipped:important-label-cut/);
  assert.throws(()=>compileProductFocusShot({...config,protectedRegions:[
    {id:'invalid-timestamp',t:90,region:{x:500,y:1900,width:200,height:100}}
  ]}),/product_focus_protected_region_invalid/);
});

test('protected editorial text cannot disappear during a camera move even when endpoints are safe',()=>{
  const camera={
    ...source,id:'relay-interpolated-hold',durationSec:4,
    focusPath:[
      {t:0,focus:source.focus,action:'Start with the comparison'},
      {t:2,focus:{x:520,y:1870,width:690,height:300},action:'Camera leaves this region'},
      {t:4,focus:source.focus,action:'Camera returns to comparison'},
    ],
  };
  const region={x:650,y:1300,width:180,height:90};
  // Both endpoints are safe, but the region gets clipped mid-shot.
  assert.doesNotThrow(()=>compileProductFocusShot({...camera,protectedRegions:[
    {id:'endpoint-one',t:0,region},
    {id:'endpoint-two',t:4,region},
  ]}));
  assert.throws(()=>compileProductFocusShot({...camera,protectedRegions:[
    {id:'continuous-hold',startSec:0,endSec:4,region},
  ]}),/product_focus_protected_region_clipped:continuous-hold/);
  const safe=compileProductFocusShot({...camera,protectedRegions:[
    {id:'first-half-second',startSec:0,endSec:.4,region},
  ]});
  assert.ok(safe.evidence.protectedFrameChecks>2);
});
test('phone-scale legibility gate rejects insufficient source glyph height',()=>{
  const region={x:650,y:1300,width:180,height:90};
  assert.throws(()=>compileProductFocusShot({...source,criticalText:[
    {id:'tiny-note',t:0,region,sourceGlyphHeightPx:11},
  ]}),/product_focus_phone_text_below_minimum:tiny-note/);
  const pass=compileProductFocusShot({...source,criticalText:[
    {id:'large-headline',t:0,region,sourceGlyphHeightPx:34,minPhonePx:9},
  ]});
  assert.equal(pass.evidence.criticalTextChecks,1);
  assert.ok(pass.evidence.minProjectedPhoneGlyphPx!>=9);
  assert.equal(pass.evidence.pixelLegibilityNotAutomaticallyVerified,true);
});
test('legibility annotations must be bounded, verified and visible',()=>{
  const region={x:650,y:1300,width:180,height:90};
  assert.throws(()=>compileProductFocusShot({...source,criticalText:[
    {id:'bad',t:0,region,sourceGlyphHeightPx:Infinity},
  ]}),/product_focus_text_annotation_invalid/);
  assert.throws(()=>compileProductFocusShot({...source,criticalText:[
    {id:'hidden',t:0,region:{x:1300,y:10,width:120,height:100},sourceGlyphHeightPx:45},
  ]}),/product_focus_critical_text_clipped:hidden/);
  assert.throws(()=>compileProductFocusShot({...source,targetPhoneWidthPx:0}),/product_focus_legibility_contract_invalid/);
});

test('a native mobile Relay capture preserves phone-scale text that a desktop shrink destroys',()=>{
  const mobile=compileProductFocusShot({
    id:'relay-mobile-native-candidate',
    sourcePath:'asset://relay-fictitious-mobile',
    sourceRefs:['ci:fictional-phone-layout-evidence'],
    sourceKind:'image',sourceWidth:390,sourceHeight:3170,
    focus:{x:25,y:1930,width:330,height:430},
    title:'Two accounts. One clarification.',
    caption:'The structured conflict is visible in the original product.',
    evidenceLabel:'FICTIONAL PRIVATE PILOT | REVIEW ONLY',
    format:'portrait',durationSec:5,
    criticalText:[{id:'real-mobile-copy',t:0,
      region:{x:48,y:2000,width:160,height:80},
      sourceGlyphHeightPx:14,minPhonePx:9}],
  });
  assert.equal(mobile.stage.width,1080);
  assert.equal(mobile.evidence.criticalTextChecks,1);
  assert.ok(mobile.evidence.minProjectedPhoneGlyphPx!>=9);
  // The corresponding 14px desktop copy does not survive the much wider crop.
  assert.throws(()=>compileProductFocusShot({...source,criticalText:[
    {id:'desktop-body-text',t:0,
      region:{x:650,y:1300,width:180,height:90},
      sourceGlyphHeightPx:14,minPhonePx:9},
  ]}),/product_focus_phone_text_below_minimum:desktop-body-text/);
});
