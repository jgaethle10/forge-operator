import crypto from 'node:crypto';

export const CFB_POWER_INDEX_INPUT_SCHEMA='evercraft.cfb-power-index-input.v1';
export const CFB_POWER_INDEX_OUTPUT_SCHEMA='evercraft.cfb-power-rankings.v1';

export const DEFAULT_CFB_POWER_MODEL=Object.freeze({
  model_version:'evercraft-cfbpi-0.2.0',
  missing_data_penalty:8,
  components:Object.freeze({
    result_quality:0.22,
    efficiency:0.32,
    schedule_strength:0.16,
    road_neutral:0.08,
    recent_form:0.17,
    availability:0.03,
    turnover_sustainability:0.02,
  }),
});

function clean(value){ return String(value??'').trim(); }
function clamp(value,min,max){ return Math.min(max,Math.max(min,value)); }
function round(value,digits=2){
  const factor=10**digits;
  return Math.round((value+Number.EPSILON)*factor)/factor;
}
function sha256(value){
  return crypto.createHash('sha256').update(value).digest('hex');
}
function stable(value){
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==='object'){
    return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));
  }
  return value;
}
function stableJson(value){ return JSON.stringify(stable(value)); }

function assertIso(value,field){
  const date=new Date(value);
  if(!Number.isFinite(date.getTime())) throw new Error(`${field}_invalid_timestamp`);
  return date.toISOString();
}
function assertScore(value,field){
  if(value===null||value===undefined||value==='') return null;
  const number=Number(value);
  if(!Number.isFinite(number)||number<0||number>100) throw new Error(`${field}_must_be_0_to_100`);
  return number;
}
function assertConfidence(value){
  if(value===null||value===undefined||value==='') return 1;
  const number=Number(value);
  if(!Number.isFinite(number)||number<0||number>1) throw new Error('evidence_confidence_must_be_0_to_1');
  return number;
}
function normalizedRecord(record={}){
  const wins=Number(record.wins);
  const losses=Number(record.losses);
  if(!Number.isInteger(wins)||wins<0||!Number.isInteger(losses)||losses<0){
    throw new Error('cfb_power_record_invalid');
  }
  const games=wins+losses;
  return {wins,losses,games,win_pct:games?round(wins/games,4):0};
}
function validateModel(model){
  const components={...(model?.components||{})};
  const names=Object.keys(components);
  if(!names.length) throw new Error('cfb_power_model_components_missing');
  let total=0;
  for(const name of names){
    const weight=Number(components[name]);
    if(!Number.isFinite(weight)||weight<=0) throw new Error(`cfb_power_model_weight_invalid:${name}`);
    total+=weight;
  }
  if(Math.abs(total-1)>0.000001) throw new Error('cfb_power_model_weights_must_sum_to_1');
  const missingDataPenalty=Number(model?.missing_data_penalty);
  if(!Number.isFinite(missingDataPenalty)||missingDataPenalty<0||missingDataPenalty>100){
    throw new Error('cfb_power_model_missing_data_penalty_invalid');
  }
  return {
    model_version:clean(model?.model_version)||'evercraft-cfbpi-custom',
    missing_data_penalty:missingDataPenalty,
    components,
  };
}

function scoreTeam(team,model){
  const teamId=clean(team?.team_id);
  const teamName=clean(team?.team_name);
  if(!teamId||!teamName) throw new Error('cfb_power_team_identity_required');
  const record=normalizedRecord(team.record);
  const sourceRefs=[...new Set((team.source_refs||[]).map(clean).filter(Boolean))];
  if(!sourceRefs.length) throw new Error(`cfb_power_source_refs_required:${teamId}`);

  const componentScores={};
  const missingComponents=[];
  let observedWeight=0;
  let weighted=0;
  for(const [name,weight] of Object.entries(model.components)){
    const score=assertScore(team.components?.[name],`cfb_power_component_${name}`);
    if(score===null){
      componentScores[name]=null;
      missingComponents.push(name);
      continue;
    }
    componentScores[name]=round(score,3);
    observedWeight+=weight;
    weighted+=score*weight;
  }
  if(observedWeight<=0) throw new Error(`cfb_power_no_observed_components:${teamId}`);

  const observedMean=weighted/observedWeight;
  const coverage=clamp(observedWeight,0,1);
  const missingPenalty=(1-coverage)*model.missing_data_penalty;
  const powerScore=clamp(observedMean-missingPenalty,0,100);
  const evidenceConfidence=assertConfidence(team.evidence_confidence);
  const confidence=clamp(coverage*evidenceConfidence,0,1);

  return {
    team_id:teamId,
    team_name:teamName,
    record,
    components:componentScores,
    component_coverage:round(coverage,4),
    evidence_confidence:round(evidenceConfidence,4),
    confidence:round(confidence,4),
    missing_components:missingComponents,
    missing_data_penalty_applied:round(missingPenalty,3),
    power_score:round(powerScore,2),
    result_quality:componentScores.result_quality??null,
    best_win:clean(team.best_win)||null,
    worst_result:clean(team.worst_result)||null,
    source_refs:sourceRefs,
    explanation:clean(team.explanation)||null,
  };
}

export function buildCfbPowerRankings(input,{model=DEFAULT_CFB_POWER_MODEL}={}){
  if(input?.schema!==CFB_POWER_INDEX_INPUT_SCHEMA) throw new Error('cfb_power_input_schema_invalid');
  const evidenceSnapshotId=clean(input.evidence_snapshot_id);
  if(!evidenceSnapshotId) throw new Error('cfb_power_evidence_snapshot_id_required');
  const evidenceThroughAt=assertIso(input.evidence_through_at,'cfb_power_evidence_through_at');
  const season=Number(input.season);
  if(!Number.isInteger(season)||season<1869||season>3000) throw new Error('cfb_power_season_invalid');
  const weekLabel=clean(input.week_label);
  if(!weekLabel) throw new Error('cfb_power_week_label_required');

  const normalizedModel=validateModel(model);
  const teams=Array.isArray(input.teams)?input.teams:[];
  if(teams.length<2) throw new Error('cfb_power_at_least_two_teams_required');

  const seen=new Set();
  const scored=teams.map(team=>{
    const id=clean(team?.team_id);
    if(seen.has(id)) throw new Error(`cfb_power_duplicate_team_id:${id}`);
    seen.add(id);
    return scoreTeam(team,normalizedModel);
  });

  scored.sort((a,b)=>
    b.power_score-a.power_score ||
    (b.result_quality??-1)-(a.result_quality??-1) ||
    b.record.win_pct-a.record.win_pct ||
    a.team_name.localeCompare(b.team_name)
  );

  const previousRanks=input.previous_ranks&&typeof input.previous_ranks==='object'?input.previous_ranks:{};
  const rankings=scored.map((team,index)=>{
    const rank=index+1;
    const previousRaw=previousRanks[team.team_id];
    const previousRank=Number.isInteger(Number(previousRaw))&&Number(previousRaw)>0?Number(previousRaw):null;
    const movement=previousRank===null?null:previousRank-rank;
    return {
      rank,
      previous_rank:previousRank,
      movement,
      movement_state:previousRank===null?'new':movement>0?'up':movement<0?'down':'unchanged',
      ...team,
    };
  });

  const runBasis={
    schema:CFB_POWER_INDEX_OUTPUT_SCHEMA,
    model:normalizedModel,
    evidence_snapshot_id:evidenceSnapshotId,
    evidence_through_at:evidenceThroughAt,
    season,
    week_label:weekLabel,
    rankings,
  };
  const runId='cfbpi:'+sha256(stableJson(runBasis)).slice(0,24);

  return {
    schema:CFB_POWER_INDEX_OUTPUT_SCHEMA,
    run_id:runId,
    season,
    week_label:weekLabel,
    evidence_snapshot_id:evidenceSnapshotId,
    evidence_through_at:evidenceThroughAt,
    generated_at:clean(input.generated_at)?assertIso(input.generated_at,'cfb_power_generated_at'):evidenceThroughAt,
    model:normalizedModel,
    rules:{
      missing_is_never_zero:true,
      missing_components_renormalized:true,
      sparse_coverage_penalized:true,
      projected_is_never_observed:true,
      deterministic_for_same_model_and_snapshot:true,
    },
    rankings,
  };
}
