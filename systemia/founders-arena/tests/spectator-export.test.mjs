import test from 'node:test';
import assert from 'node:assert/strict';
import {runDemo} from '../demo.mjs';
import {publicReplay,spectatorHtml} from '../spectator-export.mjs';

test('public spectator export verifies every replay and excludes secret resources',()=>{
  const raw=runDemo(4);const pub=publicReplay(raw);
  assert.equal(pub.turns.length,4);
  assert.equal(pub.digest,raw.digest);
  assert.ok(pub.turns.every(t=>t.standings.length===4));
  assert.ok(!JSON.stringify(pub).includes('"knowledge"'));
  assert.ok(!JSON.stringify(pub).includes('"food"'));
  assert.ok(!JSON.stringify(pub).includes('"energy"'));
  assert.ok(!JSON.stringify(pub).includes('"snapshot"'));
  const html=spectatorHtml(pub);
  assert.ok(html.includes('Founders Arena'));
  assert.ok(html.includes('SYNTHETIC FIXTURE'));
  assert.ok(html.includes('aria-label="Replay turn"'));
  assert.ok(!html.includes('"food"'));
});

test('refuses tampered match and source labels that imply live independently confirmed agents',()=>{
  const match=runDemo(2);match.final.players[0].food=999;
  assert.throws(()=>publicReplay(match),/Replay mismatch|Final state mismatch/);
  assert.throws(()=>publicReplay(runDemo(2),{source:'verified-LLM'}),/Invalid replay source/);
});

test('escaped replay payload cannot terminate the data script',()=>{
  const p=publicReplay(runDemo(1));p.notice='</script><script>alert(1)</script>';
  const out=spectatorHtml(p);
  assert.ok(!out.includes('</script><script>alert(1)</script>'));
  assert.ok(out.includes('\\u003c/script\\u003e'));
});
