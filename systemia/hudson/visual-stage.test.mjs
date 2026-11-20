import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const html=fs.readFileSync(path.resolve(here,'../../public/hudson/index.html'),'utf8');

test('HUDSON viewing stage source parses and stays read-only',()=>{
 const inline=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 assert.ok(inline,'inline dashboard controller');
 assert.doesNotThrow(()=>new vm.Script(inline));
 assert.match(html,/SOURCE HISTORY · REPLAY/);
 assert.match(html,/NEW VERIFIED PUBLIC SOURCE/);
 assert.match(html,/ANIMATED PATHS ARE NOT VERIFIED EVENTS/);
 assert.match(html,/data-kind="waiting"/);
 assert.match(html,/id="focus"/);
 assert.match(html,/aria-pressed="false"/);
 assert.match(inline,/firstFeed=true/,'initial hydration must not claim a new event');
 assert.match(inline,/!before\.has\(e\.id\)/,'only newly observed IDs can pulse');
 assert.match(inline,/Date\.now\(\)-Date\.parse\(e\.at\)<600000/,'only recent evidence can pulse as new');
 assert.match(inline,/source_verified===true/);
 assert.match(inline,/source_url/);
 assert.doesNotMatch(inline,/fetch\([^)]*private/i,'public dashboard must not call private data APIs');
});
