import test from 'node:test';
import assert from 'node:assert/strict';
import {fitAuthoredCamera,getAuthoredBounds} from './authored-camera.mjs';

const aircraft=(()=>{
  const positions=[];
  for(const x of [-20,-15,-7,0,7,15,20])
    for(const y of [-3,0,4])
      for(const z of [-19,-8,0,10,19])positions.push(x,y,z);
  return [{id:'fixture:authored-airframe',positions}];
})();

test('fit camera uses actual canonical vertices and stays inside image safely',()=>{
  const bounds=getAuthoredBounds(aircraft);
  assert.equal(bounds.span[0],40);
  assert.equal(bounds.span[1],7);
  assert.equal(bounds.span[2],38);
  for(const a of [0,Math.PI/3,Math.PI*2/3]){
    for(const [width,height] of [[1280,720],[720,1280]]){
      const fit=fitAuthoredCamera(aircraft,{angleRadians:a,width,height,
        maxHorizontalFraction:.76,maxVerticalFraction:.72});
      const b=fit.projectedBounds;
      assert.ok(fit.distance>0&&fit.near>0&&fit.far>fit.near);
      assert.ok(b.widthFraction>=.35,'expected substantial asset width');
      assert.ok(b.widthFraction<=.76,'camera did not honor image width');
      assert.ok(b.heightFraction<=.72,'camera did not honor image height');
      assert.ok(b.minX>-.78&&b.maxX<.78);
      assert.ok(b.minY>-.75&&b.maxY<.75);
    }
  }
});
test('fit camera follows actual changing artist geometry, not fixed scene distance',()=>{
  const big=fitAuthoredCamera(aircraft,{angleRadians:.7});
  const scaled=structuredClone(aircraft);
  scaled[0].positions=scaled[0].positions.map(v=>v*3);
  const bigger=fitAuthoredCamera(scaled,{angleRadians:.7});
  assert.ok(bigger.distance>big.distance*2.8);
  assert.deepEqual(
    fitAuthoredCamera(aircraft,{angleRadians:.7}),
    fitAuthoredCamera(aircraft,{angleRadians:.7})
  );
});
test('portrait framing tightens horizontal projected size rather than clipping',()=>{
  const wide=fitAuthoredCamera(aircraft,{width:1280,height:720,angleRadians:0});
  const portrait=fitAuthoredCamera(aircraft,{width:720,height:1280,angleRadians:0});
  assert.ok(portrait.distance>wide.distance);
  assert.equal(portrait.width,720);
  assert.equal(portrait.height,1280);
  assert.ok(portrait.projectedBounds.widthFraction<.77);
});
test('invalid geometry and camera constraints fail closed',()=>{
  for(const geometry of [
    [],[{positions:[]}],[{positions:[0,0,0]}],[{positions:[0,1,Infinity,1,2,3]}],
    [{positions:[0,0,0,0,0,0,0,0,0]}]
  ])assert.throws(()=>getAuthoredBounds(geometry));
  for(const input of [
    {width:0},{height:3},{fovYDeg:0},{fovYDeg:180},{angleRadians:NaN},
    {maxHorizontalFraction:0},{maxVerticalFraction:1},{elevationDeg:90}
  ])assert.throws(()=>fitAuthoredCamera(aircraft,input));
});
