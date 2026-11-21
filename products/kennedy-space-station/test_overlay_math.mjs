// Pure source-extracted geometry test, no browser or third-party runtime.
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=readFileSync(new URL('./studio.html',import.meta.url),'utf8');
const match=html.match(/function imageAffineToSvg\(coeff,scale,left,top\)\{[\s\S]*?\n\}/);
assert(match,'studio must contain the authoritative image-to-canvas affine helper');
const fn=vm.runInNewContext('('+match[0]+')');
function map(m,px,py){return [m[0]*px+m[2]*py+m[4],m[1]*px+m[3]*py+m[5]]}
const northAligned=fn([.5,0,10,0,.5,20],5,100,80);
assert.deepEqual(Array.from(northAligned),[2.5,0,0,2.5,150,180]);
assert.deepEqual(map(northAligned,32,48),[230,300]);
const rotated=fn([0,-.25,60,.25,0,20],5,100,80);
assert.deepEqual(Array.from(rotated),[0,1.25,-1.25,0,400,180]);
assert.deepEqual(map(rotated,40,60),[325,230]);
const skewed=fn([.2,-.1,22,.05,.3,-4],4,60,100);
assert.deepEqual(Array.from(skewed),[.8,.2,-.4,1.2,148,84]);
assert.deepEqual(map(skewed,10,20),[148,110]);
console.log('PASS: unrotated, rotated, and skewed source control-point mapping in actual studio helper');
