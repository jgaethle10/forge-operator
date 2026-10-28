import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Script} from 'node:vm';

test('first-party local WGS research viewer is self-contained and syntactically valid',async()=>{
  const html=await readFile(new URL('./research-viewer.html',import.meta.url),'utf8');
  const js=html.match(/<script>([\s\S]+?)<\/script>/)?.[1];
  assert.ok(js,'inline viewer JS exists');
  assert.doesNotThrow(()=>new Script(js));
  for(const f of ['wgs-resources.geojson','wgs-tests.geojson','wgs-mineHistory.geojson','wgs-studies.geojson']) {
    assert.ok(html.includes(f),'Expected input '+f);
  }
  assert.doesNotMatch(html,/<script[^>]+src=|<link[^>]+href=["']https?:|fetch\(/);
  assert.match(html,/not a mineable resource/i);
  assert.match(html,/FIRST RECORDS ONLY|research review|Research Viewer/i);
});
