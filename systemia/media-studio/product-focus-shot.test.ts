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
