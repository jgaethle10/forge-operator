import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'campaigns');
const shot=JSON.parse(fs.readFileSync(path.join(root,'before-the-doors-canary-01.json'),'utf8'));
const bible=JSON.parse(fs.readFileSync(path.join(root,'before-the-doors-canary-bible.json'),'utf8'));

test('original first shot is real moving cinematic video, not a static product poster',()=>{
 assert.equal(shot.schema,'evercraft.fallen.visual-shot-request.v1');
 assert.equal(shot.task,'video');assert.equal(shot.durationSec,2);
 assert.equal(shot.aspectRatio,'9:16');assert.equal(shot.targetResolution,'720p');
 assert.ok(shot.prompt.includes('moving hands')&&shot.prompt.includes('moving dough'));
 assert.ok(!/relay|rc35|rc03|stock footage from|stock media overlay/i.test(shot.sourceRefs.join(',')));
 assert.deepEqual(shot.references,[]);
});
test('commercial rights and provenance are required and no published canary is claimed',()=>{
 assert.ok(shot.requires.includes('commercial_rights'));
 assert.ok(shot.requires.includes('provenance_receipt'));
 assert.equal(shot.continuityDigest,bible.continuityDigest);
 assert.equal(bible.publicationAuthority,false);
 assert.equal(bible.modelExecutionVerified,false);
 assert.equal(bible.identityContinuityVerified,false);
});