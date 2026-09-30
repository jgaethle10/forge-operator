import assert from 'node:assert/strict';
import { normalizeUsState, inferUsAddressParts, regionMatchesRecord } from './geo-normalization.mjs';

assert.equal(normalizeUsState('Washington'),'WA');
assert.equal(normalizeUsState('WA'),'WA');
assert.equal(normalizeUsState('New York'),'NY');
assert.equal(normalizeUsState('not-a-state'),'');

assert.deepEqual(
  inferUsAddressParts('17801 International Blvd, SeaTac, WA 98188'),
  {state:'WA',postal_code:'98188'}
);
assert.deepEqual(inferUsAddressParts('Somewhere outside the US'),{state:'',postal_code:''});

assert.equal(regionMatchesRecord({state:'WA'},'WA'),true);
assert.equal(regionMatchesRecord({state_name:'Washington'},'WA'),true);
assert.equal(regionMatchesRecord({region_code:'WA'},'Washington'),true);
assert.equal(regionMatchesRecord({jurisdiction:'Seattle City Light service territory, Washington, USA'},'WA'),true);
assert.equal(regionMatchesRecord({jurisdiction:'Taiwan'},'WA'),false);
assert.equal(regionMatchesRecord({jurisdiction:'Wales, United Kingdom'},'WA'),false);
assert.equal(regionMatchesRecord({state:'CA'},'WA'),false);
assert.equal(regionMatchesRecord({jurisdiction:'New York, USA'},'NY'),true);
assert.equal(regionMatchesRecord({jurisdiction:'Yorkshire, United Kingdom'},'NY'),false);

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.aliev.geo-normalization-proof.v1',
  two_letter_substring_false_positive_blocked:true,
  full_state_name_supported:true,
  state_code_supported:true,
  address_state_postal_inference:true
},null,2));
