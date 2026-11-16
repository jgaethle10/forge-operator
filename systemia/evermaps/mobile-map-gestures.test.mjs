import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {computeMapGesture} from './mobile-map-gestures.mjs';
const base={view:{center:[-119,47],scale:200},width:400,height:600};
const near=(x,y)=>assert.ok(Math.abs(x-y)<1e-7,String(x)+' not near '+String(y));
test('one-finger drag translates map without unexpected zoom',()=>{
 const r=computeMapGesture({...base,before:[[200,300]],after:[[220,320]]});
 near(r.scale,200);near(r.center[1],47+.1);
 near(r.center[0],-119-20/(200*Math.cos((47+.1)*Math.PI/180)));
});
test('two-finger pinch doubles scale and holds geographic center',()=>{
 const r=computeMapGesture({...base,before:[[150,300],[250,300]],after:[[100,300],[300,300]]});
 near(r.scale,400);near(r.center[0],-119);near(r.center[1],47);
});
test('moving midpoint pans and pinches about geographic anchor',()=>{
 const r=computeMapGesture({...base,before:[[150,300],[250,300]],after:[[150,320],[350,320]]});
 near(r.scale,400);near(r.center[1],47+20/400);
 near(r.center[0],-119-50/(400*Math.cos(r.center[1]*Math.PI/180)));
});
test('zoom caps and invalid or additional pointer coordinates are rejected',()=>{
 const r=computeMapGesture({...base,view:{center:[-119,47],scale:500000},
  before:[[150,300],[250,300]],after:[[100,300],[300,300]]});
 assert.equal(r.scale,500000);
 assert.throws(()=>computeMapGesture({...base,before:[],after:[]}));
 assert.throws(()=>computeMapGesture({...base,before:[[0,0]],after:[[NaN,1]]}));
 assert.throws(()=>computeMapGesture({...base,before:[[0,0],[1,1],[2,2]],after:[[0,0],[1,1],[2,2]]}));
});
test('the real native viewer attaches a cancel-safe multi-pointer listener',async()=>{
 const html=await readFile(new URL('./research-viewer.html',import.meta.url),'utf8');
 for(const mark of ['computeMapGesture({','canvas.setPointerCapture(e.pointerId)',
  "'pointercancel'","'lostpointercapture'",'hadMultiplePointers','scheduleRedraw()','inspectorClose'])
  assert.ok(html.includes(mark),mark);
});
