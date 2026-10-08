#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import crypto from 'node:crypto';
import { fetchNcaaFbsEvidence } from './cfb-results-ingest.mjs';
import { buildCfbPowerIndexInputFromGames } from './cfb-results-model.mjs';
import { buildCfbPowerRankings } from './cfb-power-index.mjs';

function clean(value){ return String(value??'').trim(); }
function sha256(value){ return crypto.createHash('sha256').update(value).digest('hex'); }
function arg(name,fallback=''){
  const index=process.argv.indexOf('--'+name);
  return index>=0?clean(process.argv[index+1]):fallback;
}

export async function runCfbPowerEvidenceCycle({
  season,
  startDate,
  throughDate,
  weekLabel,
  outDir='_cfb_power_run',
  previousRanks={},
  fetchImpl=globalThis.fetch,
  now=new Date(),
}={}){
  const evidenceThroughAt=new Date(throughDate+'T23:59:59.999Z').toISOString();
  const evidence=await fetchNcaaFbsEvidence({
    season,
    startDate,
    endDate:throughDate,
    fetchImpl,
  });
  const membership=evidence.membership;
  const ledger=evidence.ledger;
  const evidenceSnapshotId='cfb:'+season+':'+throughDate+':'+sha256(JSON.stringify({
    membership:membership.teams,
    games:ledger.games,
  })).slice(0,20);
  const input=buildCfbPowerIndexInputFromGames({
    season,
    weekLabel,
    evidenceSnapshotId,
    evidenceThroughAt,
    teams:membership.teams,
    games:ledger.games,
    previousRanks,
    generatedAt:now.toISOString(),
  });
  const ranking=buildCfbPowerRankings(input);

  fs.mkdirSync(outDir,{recursive:true});
  fs.writeFileSync(path.join(outDir,'fbs-membership.json'),JSON.stringify(membership,null,2)+'\n');
  fs.writeFileSync(path.join(outDir,'completed-games.json'),JSON.stringify(ledger,null,2)+'\n');
  fs.writeFileSync(path.join(outDir,'cfb-power-input.json'),JSON.stringify(input,null,2)+'\n');
  fs.writeFileSync(path.join(outDir,'cfb-power-rankings.json'),JSON.stringify(ranking,null,2)+'\n');
  fs.writeFileSync(path.join(outDir,'top-25.json'),JSON.stringify({
    schema:'evercraft.cfb.top-25.v1',
    run_id:ranking.run_id,
    season:ranking.season,
    week_label:ranking.week_label,
    evidence_snapshot_id:ranking.evidence_snapshot_id,
    evidence_through_at:ranking.evidence_through_at,
    rankings:ranking.rankings.slice(0,25),
  },null,2)+'\n');

  return {
    schema:'evercraft.cfb.power-evidence-run-receipt.v1',
    run_id:ranking.run_id,
    season:ranking.season,
    week_label:ranking.week_label,
    evidence_snapshot_id:evidenceSnapshotId,
    evidence_through_at:evidenceThroughAt,
    source_authority:ledger.source_authority || membership.source_authority || 'NCAA',
    membership_rule:membership.membership_rule || null,
    fbs_team_count:membership.teams.length,
    completed_game_count:ledger.games.length,
    ranked_team_count:ranking.rankings.length,
    top_25:ranking.rankings.slice(0,25).map(row=>({
      rank:row.rank,team_id:row.team_id,team_name:row.team_name,power_score:row.power_score,confidence:row.confidence
    })),
    output_dir:outDir,
    generated_at:now.toISOString(),
  };
}

async function main(){
  const season=Number(arg('season',String(new Date().getUTCFullYear())));
  const startDate=arg('start');
  const throughDate=arg('through');
  const weekLabel=arg('week-label','Current');
  const outDir=arg('out','_cfb_power_run');
  const previousRanksPath=arg('previous-ranks','');
  if(!startDate||!throughDate) throw new Error('Usage: --start YYYY-MM-DD --through YYYY-MM-DD [--season 2026] [--week-label "Entering Week 6"] [--previous-ranks file.json]');
  let previousRanks={};
  if(previousRanksPath){
    const parsed=JSON.parse(fs.readFileSync(previousRanksPath,'utf8'));
    previousRanks=parsed?.previous_ranks&&typeof parsed.previous_ranks==='object'
      ? parsed.previous_ranks
      : parsed;
    if(!previousRanks||typeof previousRanks!=='object'||Array.isArray(previousRanks)){
      throw new Error('cfb_power_previous_ranks_invalid');
    }
  }
  const receipt=await runCfbPowerEvidenceCycle({season,startDate,throughDate,weekLabel,outDir,previousRanks});
  console.log(JSON.stringify(receipt,null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  await main();
}
