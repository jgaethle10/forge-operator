import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('Ascend and deep-learning census keep privacy and historical recovery explicit',()=>{
 const ascend=fs.readFileSync('registry/ascend/README.md','utf8');
 const legacy=fs.readFileSync('systemia/migrations/base44-exit/EDUCATION-REBUILD-2026-11-04.md','utf8');
 assert.match(ascend,/private role-based records remain account-bound/);
 assert.match(ascend,/no public youth leaderboard/);
 assert.match(ascend,/no public spotlight\/opportunity handoff without required consent/);
 assert.match(legacy,/Nepal Deep Learning Academy/);
 assert.match(legacy,/no new Base44 contact/);
 assert.match(legacy,/source_owned_preview/);
});
