import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Evercraft public submission package declares required directory artwork',()=>{
  const p=JSON.parse(fs.readFileSync(new URL('../plugins/evercraft-fabric/plugin.json',import.meta.url),'utf8'));
  const iface=p.extensions?.['com.openai']?.interface;
  assert.equal(iface?.logo,'./assets/evercraft-icon.png');
  assert.equal(iface?.composerIcon,'./assets/evercraft-icon.png');
  assert.ok(fs.existsSync(new URL('../plugins/evercraft-fabric/assets/evercraft-icon.png',import.meta.url)));
});
