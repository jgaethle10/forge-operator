import test from 'node:test';
import assert from 'node:assert/strict';
import { checkReelHtml, checkClassroomHtml, checkMp4Header, checkEngineSource } from '../scripts/qa/game-fabric-recipient-canary.mjs';

const validReel = '<html><video playsinline controls preload="metadata"><source src="assets/zero-hour-reel.mp4" type="video/mp4"></video><a href="playbook-classroom.html">Classroom</a><a href="assets/zero-hour-reel.mp4">Open the MP4 directly</a><p>Shotgun trips left flood versus nickel Cover 3 edge pressure</p><footer>Game Fabric research release v2.9</footer></html>';
const validClassroom = '<html><textarea id="callText"></textarea><button id="build"></button><svg id="field"></svg><select id="playerPicker"></select><script src="assets/classroom-ui.js"></script></html>';
const validMp4 = Buffer.alloc(128); validMp4.write('ftyp',4,'ascii'); validMp4.write('moov',40,'ascii');

test('reel requires a real MP4 source and inline playback',()=>assert.equal(checkReelHtml(validReel).length,5));
test('reel rejects missing video link',()=>assert.throws(()=>checkReelHtml(validReel.replace('assets/zero-hour-reel.mp4','/fake.mp4')),/source mismatch/));
test('reel rejects missing iOS inline flag',()=>assert.throws(()=>checkReelHtml(validReel.replace('playsinline','')),/playsinline/));
test('classroom identifies primary interaction components',()=>assert.equal(checkClassroomHtml(validClassroom).length,5));
test('classroom rejects empty shell',()=>assert.throws(()=>checkClassroomHtml('<html>OK</html>'),/missing/));
test('video rejects HTML masquerading as MP4',()=>assert.throws(()=>checkMp4Header(Buffer.from('<html>This page exists but the video does not</html>')),/ftyp/));
test('video requires metadata near beginning for streaming',()=>assert.throws(()=>checkMp4Header(validMp4.subarray(0,32)),/metadata/));
test('valid MP4 transport shape passes',()=>assert.equal(checkMp4Header(validMp4).format,'mp4'));
test('missing engine implementation is rejected',()=>assert.throws(()=>checkEngineSource('export function buildScene() {}'),/coverage/));
test('engine source check is explicitly structural, not coaching certification',()=>{
  const report=checkEngineSource('export function buildScene() { const defensivePositions=()=>{}; const FLOOD=1; }');
  assert.equal(report.length,3);
});

test('previous v2.8 reel is rejected even if playable',()=>assert.throws(()=>checkReelHtml(validReel.replace('v2.9','v2.8')),/outdated reel version/));
test('black-player fallback must remain visible',()=>assert.throws(()=>checkReelHtml(validReel.replace('Open the MP4 directly','Watch video')),/fallback missing/));
test('incorrect old Cover 0 reel description is rejected',()=>assert.throws(()=>checkReelHtml(validReel.replace('nickel Cover 3 edge pressure','Cover 0 edge blitz')),/stale demo call/));
