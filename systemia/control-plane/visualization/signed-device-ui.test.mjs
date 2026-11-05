import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';

test('Living Graph parses and shows signed-device evidence as claims, not outcomes',()=>{
  const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
  const start=html.indexOf('<script>');
  const end=html.lastIndexOf('</script>');
  assert.ok(start>=0&&end>start);
  assert.doesNotThrow(()=>new Script(html.slice(start+8,end)));
  assert.match(html,/Pinned device signatures claimed matched/);
  assert.match(html,/This browser does not verify imported signatures/);
  assert.match(html,/Device signature check \(imported\)/);
  assert.match(html,/UNVERIFIED IMPORT/);
});
