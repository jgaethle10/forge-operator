import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('Music Theory Lab uses canonical session state for additional counterpoint insight',()=>{
 const ui=readFileSync('src/FallenSessions.tsx','utf8');
 assert.match(ui,/import \{analyzePulseGridCounterpoint\} from '\.\.\/systemia\/media-studio\/pulsegrid-counterpoint-evidence\.mjs'/);
 assert.match(ui,/useMemo\(\(\)=>analyzePulseGridCounterpoint\(session,selectedScene\),\[session,selectedScene\]\)/);
 assert.match(ui,/Counterpoint and motion analysis/);
 assert.match(ui,/counterpointEvidence\.motion_summary\.contrary/);
 assert.match(ui,/counterpointEvidence\.motion_summary\.parallel_fifths/);
 assert.match(ui,/counterpointEvidence\.findings\.map/);
});
test('counterpoint display cannot promote a rulebook to automatic artistic edits or claim measured audio',()=>{
 const ui=readFileSync('src/FallenSessions.tsx','utf8');
 const start=ui.indexOf('aria-label="Counterpoint and motion analysis"');
 assert.ok(start>0);
 const displayed=ui.slice(start,start+1300);
 assert.match(displayed,/Classical parallel intervals are not universal errors/);
 assert.match(displayed,/No voice identity is assumed for chords or overlapping notes/);
 assert.doesNotMatch(displayed,/applyPulseGridTransaction/);
 assert.doesNotMatch(displayed,/release_ready:true/);
});
