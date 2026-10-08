#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function clean(value){ return String(value??'').trim(); }
function iso(value,field){
  const d=new Date(value);
  if(!Number.isFinite(d.getTime())) throw new Error(field+'_invalid');
  return d.toISOString();
}
function median(values){
  if(!values.length) return null;
  const sorted=[...values].sort((a,b)=>a-b);
  const mid=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;
}
function readJson(file){
  return JSON.parse(fs.readFileSync(file,'utf8'));
}
function validateBaseline(baseline){
  if(baseline?.schema!=='evercraft.cfb.poll-baseline.v1') throw new Error('cfb_poll_baseline_schema_invalid');
  if(clean(baseline.use_policy)!=='comparison_only_never_model_input') throw new Error('cfb_poll_baseline_use_policy_invalid');
  const rows=Array.isArray(baseline.rankings)?baseline.rankings:[];
  if(rows.length!==25) throw new Error('cfb_poll_baseline_top25_required');
  const ranks=new Set();
  const teams=new Set();
  for(const row of rows){
    const rank=Number(row.rank);
    const id=clean(row.team_id);
    if(!Number.isInteger(rank)||rank<1||rank>25||ranks.has(rank)) throw new Error('cfb_poll_baseline_rank_invalid');
    if(!id||teams.has(id)) throw new Error('cfb_poll_baseline_team_invalid');
    ranks.add(rank);
    teams.add(id);
  }
  return baseline;
}

export function compareCfbRankingToPoll({ranking,baseline}={}){
  if(ranking?.schema!=='evercraft.cfb-power-rankings.v1') throw new Error('cfb_poll_comparison_ranking_invalid');
  validateBaseline(baseline);

  const evercraftRows=(ranking.rankings||[]).slice(0,25);
  const evercraftById=new Map(evercraftRows.map(row=>[clean(row.team_id),row]));
  const pollById=new Map(baseline.rankings.map(row=>[clean(row.team_id),row]));
  const common=[];

  for(const [teamId,evercraft] of evercraftById){
    const poll=pollById.get(teamId);
    if(!poll) continue;
    const delta=Number(poll.rank)-Number(evercraft.rank);
    common.push({
      team_id:teamId,
      team_name:clean(evercraft.team_name)||clean(poll.team_name)||teamId,
      evercraft_rank:Number(evercraft.rank),
      poll_rank:Number(poll.rank),
      rank_delta:delta,
      direction:delta>0?'evercraft_higher':delta<0?'evercraft_lower':'same',
      absolute_gap:Math.abs(delta),
      evercraft_power_score:Number(evercraft.power_score),
      evercraft_confidence:Number(evercraft.confidence),
    });
  }

  const onlyEvercraft=evercraftRows
    .filter(row=>!pollById.has(clean(row.team_id)))
    .map(row=>({rank:Number(row.rank),team_id:clean(row.team_id),team_name:clean(row.team_name)}));
  const onlyPoll=baseline.rankings
    .filter(row=>!evercraftById.has(clean(row.team_id)))
    .map(row=>({rank:Number(row.rank),team_id:clean(row.team_id),team_name:clean(row.team_name)}));

  const gaps=common.map(row=>row.absolute_gap);
  const ordered=[...common].sort((a,b)=>b.absolute_gap-a.absolute_gap||a.evercraft_rank-b.evercraft_rank||a.team_name.localeCompare(b.team_name));
  const higher=common.filter(row=>row.rank_delta>0).sort((a,b)=>b.rank_delta-a.rank_delta||a.evercraft_rank-b.evercraft_rank);
  const lower=common.filter(row=>row.rank_delta<0).sort((a,b)=>a.rank_delta-b.rank_delta||a.evercraft_rank-b.evercraft_rank);

  return {
    schema:'evercraft.cfb.poll-comparison.v1',
    ranking_run_id:ranking.run_id,
    ranking_evidence_snapshot_id:ranking.evidence_snapshot_id,
    ranking_evidence_through_at:ranking.evidence_through_at,
    ranking_generated_at:ranking.generated_at,
    model_version:ranking.model?.model_version||null,
    poll:{
      poll_id:baseline.poll_id,
      poll_name:baseline.poll_name,
      published_date:baseline.published_date,
      source_authority:baseline.source_authority,
      source_url:baseline.source_url,
    },
    authority_boundary:{
      poll_used_as_model_input:false,
      comparison_only:true,
      disagreement_is_not_outcome_truth:true,
    },
    summary:{
      overlap_count:common.length,
      only_evercraft_count:onlyEvercraft.length,
      only_poll_count:onlyPoll.length,
      mean_absolute_rank_gap:gaps.length?Number((gaps.reduce((a,b)=>a+b,0)/gaps.length).toFixed(3)):null,
      median_absolute_rank_gap:gaps.length?Number(median(gaps).toFixed(3)):null,
      exact_rank_matches:common.filter(row=>row.rank_delta===0).length,
      evercraft_higher_count:higher.length,
      evercraft_lower_count:lower.length,
    },
    largest_disagreements:ordered.slice(0,10),
    evercraft_higher:higher,
    evercraft_lower:lower,
    only_evercraft:onlyEvercraft,
    only_poll:onlyPoll,
  };
}

export function latestPollBaseline({
  baselineDir='systemia/newsroom/baselines',
  pollId='ap-top25',
  at,
  maxAgeDays=8,
}={}){
  const cutoff=new Date(at);
  if(!Number.isFinite(cutoff.getTime())) throw new Error('cfb_poll_baseline_cutoff_invalid');
  if(!fs.existsSync(baselineDir)) return null;
  const candidates=fs.readdirSync(baselineDir)
    .filter(name=>name.endsWith('.json'))
    .map(name=>{
      try{
        const file=path.join(baselineDir,name);
        const baseline=validateBaseline(readJson(file));
        if(clean(baseline.poll_id)!==pollId) return null;
        const date=new Date(baseline.published_date+'T23:59:59.999Z');
        if(!Number.isFinite(date.getTime())||date>cutoff) return null;
        return {file,baseline,date};
      }catch{return null;}
    })
    .filter(Boolean)
    .sort((a,b)=>a.date-b.date);
  const selected=candidates.at(-1)||null;
  if(!selected) return null;
  const cutoffDay=Date.parse(new Date(cutoff).toISOString().slice(0,10)+'T00:00:00.000Z');
  const pollDay=Date.parse(selected.baseline.published_date+'T00:00:00.000Z');
  const ageDays=Math.max(0,Math.floor((cutoffDay-pollDay)/86400000));
  if(!Number.isInteger(Number(maxAgeDays))||Number(maxAgeDays)<0) throw new Error('cfb_poll_baseline_max_age_invalid');
  if(ageDays>Number(maxAgeDays)) throw new Error('cfb_poll_baseline_stale');
  return {...selected,age_days:ageDays,max_age_days:Number(maxAgeDays)};
}

async function main(){
  const rankingEvidencePath=clean(process.argv[2])||'public/journal/data/college-football-power-rankings-2026-10-07.json';
  const baselineDir=clean(process.argv[3])||'systemia/newsroom/baselines';
  const output=clean(process.argv[4])||'public/journal/data/cfb-power-rankings-poll-comparison.json';
  const evidence=readJson(rankingEvidencePath);
  const ranking=evidence?.schema==='evercraft.cfb-power-rankings.v1'
    ? evidence
    : evidence?.ranking;
  if(ranking?.schema!=='evercraft.cfb-power-rankings.v1'){
    throw new Error('cfb_poll_comparison_ranking_input_invalid');
  }
  const selected=latestPollBaseline({baselineDir,pollId:'ap-top25',at:ranking.generated_at||ranking.evidence_through_at});
  if(!selected) throw new Error('cfb_poll_comparison_no_baseline_available');
  const report=compareCfbRankingToPoll({ranking,baseline:selected.baseline});
  report.poll.age_days_at_comparison=selected.age_days;
  report.poll.max_age_days=selected.max_age_days;
  report.poll.freshness_state='current_or_previous_week_official_baseline';
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  process.stdout.write(JSON.stringify({
    schema:'evercraft.cfb.poll-comparison-build-receipt.v1',
    output,
    ranking_run_id:report.ranking_run_id,
    poll_id:report.poll.poll_id,
    poll_published_date:report.poll.published_date,
    poll_age_days:report.poll.age_days_at_comparison,
    poll_freshness_state:report.poll.freshness_state,
    overlap_count:report.summary.overlap_count,
    mean_absolute_rank_gap:report.summary.mean_absolute_rank_gap,
  },null,2)+'\n');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  await main();
}
