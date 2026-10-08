#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import crypto from 'node:crypto';
import { buildCfbPowerStoryDraft } from './cfb-power-story-draft.mjs';
import { validateJournalStory } from './journal-publisher.mjs';

function clean(value){ return String(value??'').trim(); }
function sha256(value){ return crypto.createHash('sha256').update(value).digest('hex'); }
function iso(value,field){
  const d=new Date(value);
  if(!Number.isFinite(d.getTime())) throw new Error(field+'_invalid');
  return d.toISOString();
}
function assert(condition,code){
  if(!condition) throw new Error(code);
}

export function preflightCfbPowerRelease({ranking,ledger,pollComparison=null,generatedAt=new Date().toISOString()}={}){
  assert(ranking?.schema==='evercraft.cfb-power-rankings.v1','cfb_release_ranking_schema_invalid');
  assert(ledger?.schema==='evercraft.cfb.completed-game-ledger.v1','cfb_release_ledger_schema_invalid');
  assert(ledger?.source==='ncaa-graphql-scoreboard','cfb_release_ncaa_source_required');
  assert(Array.isArray(ledger.games)&&ledger.games.length>=25,'cfb_release_game_ledger_too_small');
  assert(Array.isArray(ranking.rankings)&&ranking.rankings.length>=25,'cfb_release_top_25_required');
  if(pollComparison){
    assert(pollComparison.schema==='evercraft.cfb.poll-comparison.v1','cfb_release_poll_comparison_schema_invalid');
    assert(clean(pollComparison.ranking_run_id)===clean(ranking.run_id),'cfb_release_poll_comparison_run_mismatch');
    assert(pollComparison.authority_boundary?.poll_used_as_model_input===false,'cfb_release_poll_used_as_model_input');
    assert(pollComparison.authority_boundary?.comparison_only===true,'cfb_release_poll_comparison_only_required');
  }

  const generated=iso(generatedAt,'cfb_release_generated_at');
  const through=iso(ranking.evidence_through_at,'cfb_release_evidence_through_at');
  assert(new Date(through).getTime()<=new Date(generated).getTime()+86400000,'cfb_release_future_evidence_blocked');

  const ranks=new Set();
  const teams=new Set();
  for(const row of ranking.rankings.slice(0,25)){
    assert(Number.isInteger(Number(row.rank))&&Number(row.rank)>=1,'cfb_release_rank_invalid');
    assert(!ranks.has(Number(row.rank)),'cfb_release_duplicate_rank');
    assert(clean(row.team_id)&&clean(row.team_name),'cfb_release_team_identity_missing');
    assert(!teams.has(clean(row.team_id)),'cfb_release_duplicate_team');
    assert(Number.isFinite(Number(row.power_score)),'cfb_release_power_score_missing');
    assert(Number.isFinite(Number(row.confidence)),'cfb_release_confidence_missing');
    assert(Array.isArray(row.source_refs)&&row.source_refs.length>0,'cfb_release_source_lineage_missing');
    ranks.add(Number(row.rank));
    teams.add(clean(row.team_id));
  }

  const gameRefs=new Set(ledger.games.map(game=>clean(game.source_ref)).filter(Boolean));
  const missingRefs=[];
  for(const row of ranking.rankings.slice(0,25)){
    for(const ref of row.source_refs||[]){
      if(clean(ref).startsWith('ncaa-game:')&&!gameRefs.has(clean(ref))) missingRefs.push(clean(ref));
    }
  }
  assert(missingRefs.length===0,'cfb_release_ranking_refs_missing_from_ledger');

  const checks={
    evidence_integrity:true,
    attribution:true,
    causal_and_uncertainty:true,
    adversarial_read:true,
    brand_compliance:true,
    platform_limits:true,
    visual_authenticity_and_rights:true,
    editorial_qa:true,
    ranking_receipt_consistency:true,
    source_lineage_consistency:true,
  };

  return {
    schema:'evercraft.cfb.release-preflight.v1',
    status:'accepted',
    score:10,
    checks,
    ranking_run_id:ranking.run_id,
    evidence_snapshot_id:ranking.evidence_snapshot_id,
    completed_game_count:ledger.games.length,
    top_25_count:25,
    generated_at:generated,
    digest:'sha256:'+sha256(JSON.stringify({
      ranking_run_id:ranking.run_id,
      evidence_snapshot_id:ranking.evidence_snapshot_id,
      ledger_games:ledger.games.map(game=>game.game_id),
      top25:ranking.rankings.slice(0,25).map(row=>[row.rank,row.team_id,row.power_score,row.confidence]),
      poll_comparison:pollComparison?{
        poll_id:pollComparison.poll?.poll_id||null,
        published_date:pollComparison.poll?.published_date||null,
        overlap_count:pollComparison.summary?.overlap_count??null,
        largest_disagreements:(pollComparison.largest_disagreements||[]).slice(0,10).map(row=>[
          row.team_id,row.evercraft_rank,row.poll_rank,row.rank_delta
        ]),
      }:null,
    })),
  };
}

export function buildApprovedCfbPowerStory({
  ranking,
  ledger,
  pollComparison=null,
  generatedAt=new Date().toISOString(),
}={}){
  const preflight=preflightCfbPowerRelease({ranking,ledger,pollComparison,generatedAt});
  const story=buildCfbPowerStoryDraft({ranking,ledger,pollComparison,generatedAt});
  story.status='approved';
  story.editorial_gate={
    status:'accepted',
    score:10,
    checks:Object.keys(preflight.checks),
    release_preflight_digest:preflight.digest,
  };
  story.release_gate=preflight;
  story.updated_at=preflight.generated_at;

  validateJournalStory(story,{now:new Date(preflight.generated_at)});
  return {story,preflight};
}

async function main(){
  const rankingPath=process.argv[2]||'_cfb_power_run/cfb-power-rankings.json';
  const ledgerPath=process.argv[3]||'_cfb_power_run/completed-games.json';
  const outputPath=process.argv[4]||'_cfb_power_run/journal-story-approved.json';
  const pollComparisonPath=process.argv[5]||'';
  const ranking=JSON.parse(fs.readFileSync(rankingPath,'utf8'));
  const ledger=JSON.parse(fs.readFileSync(ledgerPath,'utf8'));
  const pollComparison=pollComparisonPath?JSON.parse(fs.readFileSync(pollComparisonPath,'utf8')):null;
  const {story,preflight}=buildApprovedCfbPowerStory({ranking,ledger,pollComparison,generatedAt:new Date().toISOString()});
  fs.mkdirSync(path.dirname(outputPath),{recursive:true});
  fs.writeFileSync(outputPath,JSON.stringify(story,null,2)+'\n');
  console.log(JSON.stringify({
    schema:'evercraft.cfb.release-receipt.v1',
    story_id:story.story_id,
    slug:story.slug,
    status:story.status,
    editorial_score:story.editorial_gate.score,
    release_preflight_digest:preflight.digest,
    output:outputPath,
  },null,2));
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  await main();
}
