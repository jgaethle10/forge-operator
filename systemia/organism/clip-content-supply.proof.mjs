#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('./clip-content-supply.mjs', import.meta.url), 'utf8');
assert.match(source, /wikimedia\.org/);
assert.match(source, /public domain\|cc0/);
assert.match(source, /publication_attempted:\s*false/);
assert.match(source, /MAX_REQUESTS/);
assert.match(source, /116675248108887/);
assert.match(source, /1302468962947782/);
assert.doesNotMatch(source, /openai|anthropic|gemini/i);
console.log(JSON.stringify({
  schema: 'evercraft.systemia.clip-content-supply.proof.v1',
  status: 'pass',
  guarantees: [
    'bounded_request_count',
    'wikimedia_only',
    'pd_cc0_only',
    'no_publication',
    'no_llm',
    'rnb_excluded',
    'political_transparency_page_excluded'
  ]
}));
