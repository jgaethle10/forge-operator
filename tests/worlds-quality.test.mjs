import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_QUALITY,validQualityMode,modeScale,tuneQuality} from '../public/worlds/quality.mjs';
test('quality modes reject unrecognized local preferences',()=>{
 assert.equal(validQualityMode('sharp'),'sharp');
 assert.equal(validQualityMode('__proto__'),'auto');
 assert.equal(modeScale('smooth'),.62);
 assert.equal(modeScale('sharp'),1);
});
test('auto renderer adapts gradually and stays bounded',()=>{
 let state={...DEFAULT_QUALITY};
 state=tuneQuality(state,15);
 assert.equal(state.scale,1);
 state=tuneQuality(state,15);
 assert.equal(state.scale,.88);
 for(let i=0;i<100;i++)state=tuneQuality(state,8);
 assert.equal(state.scale,.55);
 for(let i=0;i<8;i++)state=tuneQuality(state,60);
 assert.ok(state.scale>.55);
 for(let i=0;i<300;i++)state=tuneQuality(state,60);
 assert.equal(state.scale,1);
 assert.equal(tuneQuality(state,NaN).scale,1);
});
