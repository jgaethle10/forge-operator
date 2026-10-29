import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('public/mesh/ai-boardroom/compare/index.html','utf8');

test('free demo is an intentional one-click public guest pass',()=>{
 assert.ok(source.includes('href="?demo=1"'));
 assert.ok(source.includes("get('demo')==='1'"));
 assert.ok(source.includes("byId('sample').click();"));
 assert.ok(source.includes("byId('compare-form').requestSubmit();"));
 assert.ok(source.includes('id="share-guest"'));
});

test('share URL contains a fixed public example only',()=>{
 assert.match(source,/new URL\('\?demo=1',location\.origin\+location\.pathname\)/);
 assert.ok(source.includes('Your pasted questions and answers are never placed in a link.'));
 assert.ok(source.includes("const link=guestPass();"));
 assert.doesNotMatch(source,/URLSearchParams\([^)]*(question|answer|response)/i);
 assert.doesNotMatch(source,/localStorage|sessionStorage|sendBeacon|XMLHttpRequest|fetch\s*\(/);
});
