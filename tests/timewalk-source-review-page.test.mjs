import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../public/worlds/timewalk/',import.meta.url);
const file=n=>readFileSync(new URL(n,root),'utf8');
const html=file('review.html');
const script=file('source-review-page.mjs');

test('research page is under original Worlds route with no independent renderer',()=>{
 assert.match(html,/EVERCRAFT WORLDS/);
 assert.match(html,/href="\.\.\/"/);
 assert.match(html,/src="\.\/source-review-page\.mjs"/);
 assert.doesNotMatch(html,/<canvas\b/i);
 assert.doesNotMatch(html,/webgl2|three\.js|iframe\s/i);
 assert.doesNotMatch(html,/<script.*src="https?:/i);
});
test('source UI calls source-review validator before showing archive references',()=>{
 assert.match(script,/import \{sourceInspectionPacket\}/);
 assert.match(script,/sourceInspectionPacket\(queue,ledger,acquisition\)/);
 assert.match(script,/read\('source-review-queue\.v1\.json'\)/);
 assert.match(script,/read\('csun-1960-acquisition\.v1\.json'\)/);
 assert.match(script,/source\.viewerUrl/);
 assert.match(script,/sourceName\[source.sheet\]/);
});
test('page remains an uneditable archival view, not a geometry editor',()=>{
 assert.match(html,/Read-only research view/);
 assert.match(html,/No automatic 1952-to-1960 geometry conversion is approved/);
 assert.doesNotMatch(html,/<form\b/i);
 assert.doesNotMatch(script,/saveWorld\(|publishWorld\(|toEngineWorld\(/);
 assert.doesNotMatch(script,/\.innerHTML\s*=/);
});
