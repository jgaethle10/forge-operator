import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compareStructuredCheckins} from '../public/relay/pilot/demo/logic.mjs';
const samples=[{date:'2026-11-02',event:'construction_start'},{date:'2026-11-02',event:'permit_submission'}];
test('fictional Relay example flags same-date disagreement',()=>{
 const x=compareStructuredCheckins(samples);assert.equal(x.status,'clarification_needed');
 assert.deepEqual(x.differences,[{type:'milestone_meaning',date:'2026-11-02'}]);
});
test('disagreement versus silence versus matching structured answers',()=>{
 assert.equal(compareStructuredCheckins(samples.slice(0,1)).status,'collecting');
 assert.equal(compareStructuredCheckins([{...samples[0]},{...samples[0]}]).status,'no_structured_difference_detected');
 assert.equal(compareStructuredCheckins([{date:'2026-11-02',event:'permit_submission'},{date:'2026-11-03',event:'permit_submission'}]).differences[0].type,'milestone_date');
 assert.equal(compareStructuredCheckins([{date:'2026-02-30',event:'permit_submission'},samples[1]]).status,'invalid');
});
test('public demo makes no hosted access or customer-success claims',()=>{
 const html=fs.readFileSync(new URL('../public/relay/pilot/demo/index.html',import.meta.url),'utf8');
 assert.match(html,/Fictional interactive walkthrough/);
 assert.match(html,/No real meetings, accounts, messages, or private data/);
 assert.match(html,/Request a private pilot/);
 assert.doesNotMatch(html,/real customer|guaranteed|AI detects|automatically joins/i);
});
