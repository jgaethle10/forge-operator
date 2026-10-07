import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { validateJournalStory, publishJournalStories } from './journal-publisher.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const storyPath=path.join(here,'stories','2026-10-06-cfb-power-rankings.json');

function loadStory(){
  return JSON.parse(fs.readFileSync(storyPath,'utf8'));
}

test('approved CFB edition visible Top 25 matches its frozen machine evidence exactly',()=>{
  const story=loadStory();
  const visible=story.ranking_table?.rows||[];
  const frozen=story.machine_evidence?.payload?.rankings_top_25||[];
  assert.equal(visible.length,25);
  assert.equal(frozen.length,25);

  for(let i=0;i<25;i+=1){
    assert.equal(visible[i].rank,frozen[i].rank,'rank '+(i+1));
    assert.equal(visible[i].team_name,frozen[i].team_name,'team '+(i+1));
    assert.deepEqual(visible[i].record,{wins:frozen[i].record.wins,losses:frozen[i].record.losses},'record '+(i+1));
    assert.equal(visible[i].power_score,frozen[i].power_score,'power score '+(i+1));
    assert.equal(visible[i].confidence,frozen[i].confidence,'confidence '+(i+1));
    assert.equal(visible[i].ap_rank??null,frozen[i].ap_rank??null,'AP rank '+(i+1));
  }
});

test('approved CFB edition claims are bound to the frozen leader, model and ledger count',()=>{
  const story=loadStory();
  const evidence=story.machine_evidence.payload;
  const leader=evidence.rankings_top_25[0];
  const claims=story.claims.map(row=>row.claim).join('\n');

  assert.equal(story.title.includes(leader.team_name),true);
  assert.equal(claims.includes(leader.team_name),true);
  assert.equal(claims.includes(String(leader.power_score)),true);
  assert.equal(claims.includes(String(evidence.ledger.completed_game_count)),true);
  assert.equal(story.ranking_table.note.includes('v0.2'),true);
  assert.equal(evidence.model.model_version,'evercraft-cfbpi-0.2.0');
  assert.equal(evidence.methodology.margin_cap,35);
  assert.equal(evidence.methodology.iterations,60);
  assert.equal(evidence.ledger.source,'ncaa-graphql-scoreboard');
  assert.match(evidence.ledger.sha256,/^[a-f0-9]{64}$/);
  assert.match(evidence.ranking_sha256,/^[a-f0-9]{64}$/);
});

test('approved CFB edition passes Journal gates and materializes canonical evidence plus ranking visuals',()=>{
  const story=loadStory();
  const now=new Date('2026-10-07T05:00:00.000Z');
  const validated=validateJournalStory(story,{now});
  assert.equal(validated.status,'approved');

  const outDir=fs.mkdtempSync('/tmp/evercraft-cfb-edition-');
  const origin='https://journal.test.evercraft.local';
  const report=publishJournalStories([story],{outDir,now,publicOrigin:origin});
  const receipt=report.receipts[0];

  assert.equal(receipt.canonical_url,origin+'/'+story.slug+'/');
  assert.equal(receipt.publication_state,'live');
  assert.ok(fs.existsSync(path.join(outDir,story.machine_evidence.relative_path)));
  assert.ok(fs.existsSync(path.join(outDir,'production',story.slug,'ranking-feed.svg')));
  assert.ok(fs.existsSync(path.join(outDir,'production',story.slug,'ranking-square.svg')));
  assert.ok(fs.existsSync(path.join(outDir,'production',story.slug,'ranking-story.svg')));

  const handoff=JSON.parse(fs.readFileSync(path.join(outDir,'production',story.slug,'clip-handoff.json'),'utf8'));
  assert.equal(handoff.canonical_url,receipt.canonical_url);
  assert.equal(handoff.link_verification.expectedCanonicalUrl,receipt.canonical_url);
  assert.equal(handoff.link_verification.expectedOgUrl,receipt.canonical_url);
  assert.equal(handoff.link_verification.expectedStoryId,story.story_id);
  assert.ok(handoff.ranking_visuals.feed.url.startsWith(origin+'/production/'));
});
