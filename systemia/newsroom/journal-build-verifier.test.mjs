import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { publishJournalStories } from './journal-publisher.mjs';
import { verifyJournalBuild } from './journal-build-verifier.mjs';

const origin='https://journal.test.evercraft.local';

function sourceStory(){
  return JSON.parse(fs.readFileSync(new URL('./stories/2026-10-06-cfb-power-rankings.json',import.meta.url),'utf8'));
}
function build(){
  const outDir=fs.mkdtempSync(path.join(os.tmpdir(),'journal-verifier-'));
  publishJournalStories([sourceStory()],{
    outDir,
    now:new Date('2026-10-07T07:00:00.000Z'),
    publicOrigin:origin,
  });
  return outDir;
}

test('verifies receipt, canonical identity, machine evidence and ranking visuals structurally',()=>{
  const outDir=build();
  const result=verifyJournalBuild({root:outDir,expectedOrigin:origin});
  assert.equal(result.verified,true);
  assert.equal(result.live_story_count,1);
  assert.match(result.stories[0].ranking_run_id,/^cfbpi:/);
});

test('fails closed when an article canonical URL drifts from its publication receipt',()=>{
  const outDir=build();
  const article=path.join(outDir,'college-football-power-rankings-2026-10-06','index.html');
  fs.writeFileSync(article,fs.readFileSync(article,'utf8').replace(origin+'/college-football-power-rankings-2026-10-06/','https://wrong.example/story/'));
  assert.throws(()=>verifyJournalBuild({root:outDir,expectedOrigin:origin}),/article_hash_mismatch|article_canonical_missing/);
});

test('fails closed when a ranking visual no longer matches its receipt hash',()=>{
  const outDir=build();
  const visual=path.join(outDir,'production','college-football-power-rankings-2026-10-06','ranking-square.svg');
  fs.appendFileSync(visual,'<!-- tampered -->');
  assert.throws(()=>verifyJournalBuild({root:outDir,expectedOrigin:origin}),/ranking_visual_hash_mismatch/);
});
