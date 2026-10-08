#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function clean(value){ return String(value??'').trim(); }
function iso(value){
  const d=new Date(value);
  if(!Number.isFinite(d.getTime())) return null;
  return d.toISOString();
}
function candidateFiles(dir){
  if(!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(name=>/^college-football-power-rankings-\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .map(name=>path.join(dir,name));
}
function readEdition(file){
  try{
    const parsed=JSON.parse(fs.readFileSync(file,'utf8'));
    const ranking=parsed?.ranking;
    if(parsed?.schema!=='evercraft.cfb.edition-evidence.v1') return null;
    if(ranking?.schema!=='evercraft.cfb-power-rankings.v1') return null;
    const evidenceThrough=iso(ranking.evidence_through_at);
    if(!evidenceThrough) return null;
    return {
      file,
      evidence:parsed,
      ranking,
      evidence_through_at:evidenceThrough,
    };
  }catch{
    return null;
  }
}

export function loadCfbEditionHistory({
  dataDir='public/journal/data',
  season=null,
}={}){
  return candidateFiles(dataDir)
    .map(readEdition)
    .filter(Boolean)
    .filter(row=>season===null||Number(row.ranking.season)===Number(season))
    .sort((a,b)=>new Date(a.evidence_through_at)-new Date(b.evidence_through_at));
}

export function previousRanksForCfbEdition({
  dataDir='public/journal/data',
  season,
  throughDate,
}={}){
  const cutoff=new Date(String(throughDate)+'T23:59:59.999Z');
  if(!Number.isFinite(cutoff.getTime())) throw new Error('cfb_history_through_date_invalid');
  const candidates=loadCfbEditionHistory({dataDir,season})
    .filter(row=>new Date(row.evidence_through_at)<cutoff);
  const previous=candidates.at(-1)||null;
  const previousRanks={};
  if(previous){
    for(const row of previous.ranking.rankings||[]){
      const id=clean(row.team_id);
      const rank=Number(row.rank);
      if(id&&Number.isInteger(rank)&&rank>0) previousRanks[id]=rank;
    }
  }
  return {
    schema:'evercraft.cfb.previous-ranks.v1',
    source_edition:previous?{
      run_id:previous.ranking.run_id,
      evidence_snapshot_id:previous.ranking.evidence_snapshot_id,
      evidence_through_at:previous.evidence_through_at,
      model_version:previous.ranking.model?.model_version||null,
      team_count:Object.keys(previousRanks).length,
      source_file:path.basename(previous.file),
    }:null,
    previous_ranks:previousRanks,
  };
}

export function buildCfbRankingHistory({dataDir='public/journal/data',season=null}={}){
  const editions=loadCfbEditionHistory({dataDir,season});
  return {
    schema:'evercraft.cfb.ranking-history.v1',
    season:season===null?null:Number(season),
    edition_count:editions.length,
    generated_from:'persisted_evercraft_journal_edition_evidence',
    editions:editions.map(item=>({
      run_id:item.ranking.run_id,
      season:item.ranking.season,
      week_label:item.ranking.week_label,
      model_version:item.ranking.model?.model_version||null,
      evidence_snapshot_id:item.ranking.evidence_snapshot_id,
      evidence_through_at:item.ranking.evidence_through_at,
      generated_at:item.ranking.generated_at,
      top_25:(item.ranking.rankings||[]).slice(0,25).map(row=>({
        rank:row.rank,
        previous_rank:row.previous_rank??null,
        movement:row.movement??null,
        movement_state:row.movement_state||null,
        team_id:row.team_id,
        team_name:row.team_name,
        power_score:row.power_score,
        confidence:row.confidence,
        record:row.record,
      })),
    })),
  };
}

async function main(){
  const mode=clean(process.argv[2])||'build';
  if(mode==='previous'){
    const season=Number(process.argv[3]);
    const throughDate=clean(process.argv[4]);
    const dataDir=clean(process.argv[5])||'public/journal/data';
    process.stdout.write(JSON.stringify(previousRanksForCfbEdition({dataDir,season,throughDate}),null,2)+'\n');
    return;
  }
  if(mode==='build'){
    const dataDir=clean(process.argv[3])||'public/journal/data';
    const output=clean(process.argv[4])||'public/journal/data/cfb-power-rankings-history.json';
    const season=process.argv[5]?Number(process.argv[5]):null;
    const history=buildCfbRankingHistory({dataDir,season});
    fs.mkdirSync(path.dirname(output),{recursive:true});
    fs.writeFileSync(output,JSON.stringify(history,null,2)+'\n');
    process.stdout.write(JSON.stringify({
      schema:'evercraft.cfb.ranking-history-build-receipt.v1',
      output,
      season:history.season,
      edition_count:history.edition_count,
    },null,2)+'\n');
    return;
  }
  throw new Error('Usage: cfb-ranking-history.mjs previous <season> <through-date> [data-dir] | build [data-dir] [output] [season]');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  await main();
}
