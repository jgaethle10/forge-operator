import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/evercraft-web/index.html',import.meta.url),'utf8');
for(const required of ['Your AI read the page.','Illustrative only. No request executed','Browser Worker','Search','public GitHub issue','source material','Content hash']) {
  assert.ok(html.toLowerCase().includes(required.toLowerCase()),'missing truthful buyer messaging: '+required);
}
assert.ok(!html.includes('base44.app'),'no legacy backend CTA');
assert.ok(!/free forever|faster than tinyfish|live browser automation|buy now/i.test(html),'no unsupported commercial claims');
console.log('Evercraft Web landing copy contract passed.');
