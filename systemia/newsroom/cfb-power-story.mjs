function clean(value){ return String(value??'').trim(); }
function addHours(iso,hours){
  const date=new Date(iso);
  if(!Number.isFinite(date.getTime())) throw new Error('cfb_story_invalid_published_at');
  return new Date(date.getTime()+hours*3600000).toISOString();
}
function movementLabel(row){
  if(row.previous_rank==null) return 'NEW';
  if(row.movement>0) return '↑'+row.movement;
  if(row.movement<0) return '↓'+Math.abs(row.movement);
  return '—';
}
function recordLabel(row){
  return `${row.record?.wins??0}-${row.record?.losses??0}`;
}
function topList(rows,count=5){
  return rows.slice(0,count).map(row=>`No. ${row.rank} ${row.team_name} (${recordLabel(row)}, Power Score ${row.power_score})`).join('; ');
}

export function buildCfbPowerRankingJournalStory({
  ranking,
  runReceipt=null,
  publishedAt,
  status='approved',
  editorialScore=10,
}={}){
  if(ranking?.schema!=='evercraft.cfb-power-rankings.v1') throw new Error('cfb_story_ranking_schema_invalid');
  if(!Array.isArray(ranking.rankings)||ranking.rankings.length<25) throw new Error('cfb_story_top_25_required');
  const published=new Date(publishedAt);
  if(!Number.isFinite(published.getTime())) throw new Error('cfb_story_published_at_required');
  const top25=ranking.rankings.slice(0,25);
  const leader=top25[0];
  const label=clean(ranking.week_label)||'Current';
  const slug=`college-football-power-rankings-${ranking.season}-${clean(ranking.evidence_through_at).slice(0,10)}`;
  const storyId=`journal:${ranking.season}:${clean(ranking.evidence_through_at).slice(0,10)}:cfb-power-rankings`;
  const completedGames=Number(runReceipt?.completed_game_count||0);
  const rankedTeams=Number(runReceipt?.ranked_team_count||ranking.rankings.length);
  const evidenceSentence=completedGames>0
    ?`The evidence snapshot contains ${completedGames} completed NCAA FBS-scoreboard games and ${rankedTeams} rankable teams.`
    :`The ranking is bound to evidence snapshot ${ranking.evidence_snapshot_id} and ${rankedTeams} rankable teams.`;

  const biggestMovers=[...top25]
    .filter(row=>Number.isFinite(row.movement)&&row.movement!==0)
    .sort((a,b)=>Math.abs(b.movement)-Math.abs(a.movement))
    .slice(0,5);
  const moverText=biggestMovers.length
    ?biggestMovers.map(row=>`${row.team_name} ${movementLabel(row)} to No. ${row.rank}`).join('; ')
    :'This is the first preserved edition, so movement begins with the next ranking rather than being invented retroactively.';

  return {
    schema:'evercraft.journal.story.v1',
    story_id:storyId,
    slug,
    title:`Evercraft College Football Power Rankings: ${label}`,
    dek:`${leader.team_name} leads Evercraft's results-first Top 25, built from completed NCAA game evidence rather than copied from a human poll.`,
    desk:'Sports',
    story_type:'Power Rankings',
    status,
    published_at:published.toISOString(),
    updated_at:published.toISOString(),
    freshness_expires_at:addHours(published.toISOString(),168),
    evidence_state:'verified_public_source_plus_versioned_model',
    sensitivity:{state:'public_unclassified',classified_detail_policy:'do_not_infer_or_expand'},
    sources:[
      {
        source_id:'ncaa-fbs-scoreboard',
        label:'NCAA FBS football scores',
        publisher:'NCAA',
        url:'https://www.ncaa.com/scoreboard/football/fbs',
        evidence_state:'verified',
      },
      {
        source_id:'ncaa-fbs-standings',
        label:'NCAA FBS football standings',
        publisher:'NCAA',
        url:'https://www.ncaa.com/standings/football/fbs',
        evidence_state:'verified',
      },
    ],
    claims:[
      {
        claim:`${leader.team_name} is No. 1 in this Evercraft CFB Power Index edition with a Power Score of ${leader.power_score}.`,
        evidence_state:'verified',
        source_refs:['ncaa-fbs-scoreboard','ncaa-fbs-standings'],
      },
      {
        claim:`This edition is computed from evidence snapshot ${ranking.evidence_snapshot_id} using model ${ranking.model?.model_version||'unknown'}.`,
        evidence_state:'verified',
        source_refs:['ncaa-fbs-scoreboard','ncaa-fbs-standings'],
      },
    ],
    ranking_board:{
      schema:'evercraft.journal.ranking-board.v1',
      title:'Evercraft Top 25',
      run_id:ranking.run_id,
      evidence_snapshot_id:ranking.evidence_snapshot_id,
      rows:top25.map(row=>({
        rank:row.rank,
        previous_rank:row.previous_rank,
        movement:row.movement,
        movement_label:movementLabel(row),
        team:row.team_name,
        record:recordLabel(row),
        power_score:row.power_score,
        confidence:row.confidence,
        best_win:row.best_win,
        explanation:row.explanation,
      })),
    },
    sections:[
      {
        heading:'The Evercraft Top 25',
        body:`The first five teams in this edition are ${topList(top25)}. Those positions come from the same versioned scoring model used across the entire field, not from a manual reshuffle after looking at the AP or Coaches Poll. The full board below preserves each team's score, record, confidence and movement so future editions can be audited against what Evercraft actually published at the time.`,
      },
      {
        heading:'What moved the board',
        body:`${moverText} Movement is calculated only against a previously preserved Evercraft edition. A team cannot be awarded a dramatic rise or fall merely because another outlet changed its opinion, and the first edition does not fabricate a prior rank for visual drama. That gives the archive an honest starting line for measuring whether the model is learning anything useful.`,
      },
      {
        heading:'How the Power Index works',
        body:`This version is deliberately results-first. It blends opponent-adjusted result quality, scoring-margin efficiency, schedule strength, road or neutral performance and recent form. Missing injury and turnover-quality inputs remain missing instead of being converted to zeroes, while incomplete coverage reduces confidence. Non-FBS opponents receive reduced schedule credit so a blowout of a lower-division visitor cannot masquerade as the same evidence as beating a strong FBS opponent.`,
      },
      {
        heading:'Evidence and accountability',
        body:`${evidenceSentence} The model version is ${ranking.model?.model_version||'unavailable'}, and the ranking run is ${ranking.run_id}. Evercraft preserves the weekly output instead of rewriting old rankings after later results arrive. That archive is what will eventually let us compare CFBPI against subsequent game outcomes, AP and Coaches consensus, and later CFP rankings without cherry-picking only the weeks the model looked smart.`,
      },
    ],
    uncertainty_notes:[
      'The current model is results-first and does not yet ingest complete injury availability or turnover-sustainability data.',
      'FBS membership is currently inferred from repeated appearances on the NCAA division-11 FBS schedule surface and remains labeled as inferred in the evidence bundle.',
      'Power Score is an Evercraft model output, not an NCAA, AP, Coaches Poll or CFP ranking.',
    ],
    production_grade:{
      status:'accepted',
      hero_kind:'data_visualization',
      text_primary:false,
      note:'Primary visual treatment is the ranking board generated from the preserved CFBPI run.',
    },
    editorial_gate:{
      status:editorialScore>=10?'accepted':'pending',
      score:Number(editorialScore),
      checks:[
        'evidence_integrity',
        'attribution',
        'causal_and_uncertainty',
        'adversarial_read',
        'brand_compliance',
        'platform_limits',
        'visual_authenticity_and_rights',
        'editorial_qa',
      ],
    },
    fallen_brief:{
      contract:'evercraft.fallen.journal.production.v1',
      package_key:ranking.run_id,
      mission_key:'evercraft-cfb-power-rankings',
      work_key:slug,
      story:{
        title:`Evercraft College Football Power Rankings: ${label}`,
        thesis:'A transparent, results-first weekly Top 25 can be more accountable than a disposable opinion poll.',
        education_goal:'Explain which teams the current evidence says are strongest, why they moved, and what remains uncertain.',
        desk:'sports',
      },
      evidence:{
        source_refs:['ncaa-fbs-scoreboard','ncaa-fbs-standings'],
        evidence_refs:[ranking.evidence_snapshot_id,ranking.run_id],
        evidence_state:'verified_public_source_plus_versioned_model',
        confidence:'bounded_by_team_level_confidence',
        freshness_state:'fresh',
        volatile_claims:[
          {
            claim_key:'cfb-power-leader',
            claim:`${leader.team_name} is No. 1 in this CFBPI edition.`,
            source_ref:'ncaa-fbs-scoreboard',
            verified_at:published.toISOString(),
            expires_at:addHours(published.toISOString(),168),
            freshness_state:'fresh',
          },
        ],
        uncertainty_notes:'Injury and turnover-quality components remain intentionally missing until source-bound feeds are added.',
      },
      rights:{visual_rights_state:'not_required'},
      derivative_plan:[
        {format:'facebook',angle:'Top 25 ranking board plus biggest movement'},
        {format:'linkedin',angle:'Transparent methodology and accountability layer'},
        {format:'youtube_short',angle:'Who is actually strongest right now according to the Evercraft CFBPI?'},
      ],
      visual_story:{
        id:'cfb-power-rankings-'+ranking.run_id.replace(/[^a-z0-9]+/gi,'-').toLowerCase(),
        headline:'Evercraft College Football Power Rankings',
        subhead:label,
        durationSec:45,
        aspectRatio:'9:16',
        metrics:[
          {id:'leader-score',label:`No. 1: ${leader.team_name}`,value:Number(leader.power_score),unit:'Power Score',evidenceState:'modeled_from_public_source',sourceRefs:['ncaa-fbs-scoreboard']},
          {id:'ranked-field',label:'Teams ranked',value:25,unit:'teams',evidenceState:'modeled_from_public_source',sourceRefs:['ncaa-fbs-scoreboard']},
        ],
      },
    },
    derivatives:[
      {
        platform:'facebook',
        copy:`Evercraft's college football Top 25 is live. ${leader.team_name} sits at No. 1 in a results-first ranking built from completed NCAA game evidence, with the model, confidence and weekly movement preserved so we can grade ourselves later.`,
      },
      {
        platform:'linkedin',
        copy:`We built our college football power ranking as an auditable model rather than a disposable opinion list. Every weekly edition preserves the evidence snapshot, model version, team confidence and movement so future game outcomes can tell us whether the ranking actually deserves trust.`,
      },
      {
        platform:'youtube_short',
        hook:`${leader.team_name} is No. 1 in Evercraft's CFB Power Index. Here is why.`,
        duration_sec:45,
      },
    ],
  };
}
