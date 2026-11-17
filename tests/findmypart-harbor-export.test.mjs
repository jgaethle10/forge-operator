import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCaptionPack} from '../scripts/build-findmypart-harbor-kit.mjs';
import {HARBOR_FINDMYPART_LAUNCH} from '../systemia/distribution/harbor/findmypart-launch.mjs';

test('Harbor export has four caption drafts, never post receipts',()=>{
 const text=buildCaptionPack();
 for(const p of ['FACEBOOK','INSTAGRAM','LINKEDIN','TIKTOK'])assert.match(text,new RegExp('=== '+p+' ==='));
 assert.match(text,/STAGED, NOT PUBLISHED/);
 assert.match(text,/HUMAN-ATTACHED ONLY/);
 assert.equal(HARBOR_FINDMYPART_LAUNCH.outcome.published_receipts.length,0);
});
