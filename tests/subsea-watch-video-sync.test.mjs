import test from 'node:test';
import assert from 'node:assert/strict';
import {parseVideoStart,videoAtMissionTime,missionTimeAtVideo} from '../public/subsea-watch/immersive/video-sync.mjs';

test('manual video alignment is a bounded user-declared offset, not a clock inference',()=>{
 assert.equal(parseVideoStart('0'),0);
 assert.equal(parseVideoStart('-12.5'),-12.5);
 assert.equal(parseVideoStart('30.25'),30.25);
 for(const x of ['',undefined,'no time','Infinity',90000,-90000])
  assert.throws(()=>parseVideoStart(x));
});
test('no footage is invented before, after, or without media metadata',()=>{
 assert.deepEqual(videoAtMissionTime(5,10,30),{state:'before_video',videoTime:null});
 assert.deepEqual(videoAtMissionTime(10,10,30),{state:'within_video',videoTime:0});
 assert.deepEqual(videoAtMissionTime(25.5,10,30),{state:'within_video',videoTime:15.5});
 assert.deepEqual(videoAtMissionTime(40,10,30),{state:'after_video',videoTime:null});
 assert.deepEqual(videoAtMissionTime(18,0,NaN),{state:'metadata_unavailable',videoTime:null});
 assert.equal(videoAtMissionTime(0,-5,100).videoTime,5);
});
test('reverse clock mapping respects same manual alignment',()=>{
 assert.equal(missionTimeAtVideo(12,25),37);
 assert.equal(missionTimeAtVideo(12,-5),7);
 assert.throws(()=>missionTimeAtVideo(-1,0));
 assert.throws(()=>videoAtMissionTime(NaN,0,20));
});
