import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
const location=new URL('../public/worlds/perception-lab/index.html',import.meta.url);
const html=readFileSync(location,'utf8');
test('browser lab imports owned local modules and controls exist',()=>{
  const source=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(source,'module script missing');
  const imports=[...source.matchAll(/^import .* from ['"]([^'"]+)['"];?$/gm)].map(m=>m[1]);
  assert.ok(imports.some(s=>s.includes('spatial-temporal.mjs')));
  for(const path of imports) {
    assert.ok(path.startsWith('.'),'no remote script imports');
    assert.ok(existsSync(resolve(dirname(location.pathname),path)),'missing local import '+path);
  }
  for(const id of ['temporalFrame','temporalCanvas','syntheticSequence','loadSequence',
    'sequenceFile','downloadReview','timelineTracks','timelineEvents','temporalStatus'])
    assert.ok(html.includes('id="'+id+'"'),'missing '+id);
  assert.doesNotThrow(()=>new Function(source.replace(/^import .*;\n/gm,'')));
});
test('UI export is unreviewed and stays entirely on device',()=>{
  assert.match(html,/temporalReviewPacket\(temporalResult\)/);
  assert.match(html,/URL\.createObjectURL\(blob\)/);
  assert.match(html,/file\.size>10000000/);
  assert.doesNotMatch(html,/fetch\(['"]https?:\/\//);
});
