#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function clean(value){ return String(value ?? '').trim(); }
function iso(value, field){
  const d = new Date(value);
  if(!Number.isFinite(d.getTime())) throw new Error(field + '_invalid');
  return d.toISOString();
}
function dateLabel(value){
  return new Date(value).toLocaleDateString('en-US', {
    timeZone:'America/Los_Angeles',
    month:'long',
    day:'numeric',
    year:'numeric'
  });
}
function topNames(rows, count=5){
  return rows.slice(0, count).map(row => '#' + row.rank + ' ' + row.team_name).join(', ');
}
function recordLabel(row){
  return String(row.record?.wins ?? 0) + '-' + String(row.record?.losses ?? 0);
}

export function buildCfbPowerStoryDraft({
  ranking,
  ledger,
  generatedAt = new Date().toISOString(),
  freshnessHours = 168,
} = {}){
  if(ranking?.schema !== 'evercraft.cfb-power-rankings.v1') throw new Error('cfb_story_ranking_schema_invalid');
  if(ledger?.schema !== 'evercraft.cfb.completed-game-ledger.v1') throw new Error('cfb_story_ledger_schema_invalid');
  if(!Array.isArray(ranking.rankings) || ranking.rankings.length < 25) throw new Error('cfb_story_top_25_required');
  if(!Array.isArray(ledger.games) || !ledger.games.length) throw new Error('cfb_story_game_ledger_required');

  const publishedAt = iso(generatedAt, 'cfb_story_generated_at');
  const expiresAt = new Date(new Date(publishedAt).getTime() + Number(freshnessHours) * 3600000).toISOString();
  const throughDay = ranking.evidence_through_at.slice(0, 10);
  const slug = 'college-football-power-rankings-' + throughDay;
  const top25 = ranking.rankings.slice(0, 25);
  const leader = top25[0];
  const runnerUp = top25[1];
  const dataUrl = ledger.source_urls?.at(-1);
  if(!clean(dataUrl)) throw new Error('cfb_story_ncaa_data_url_required');

  return {
    schema:'evercraft.journal.story.v1',
    story_id:'journal:' + throughDay + ':cfb-power-rankings',
    slug,
    title:'Evercraft College Football Power Rankings: ' + leader.team_name + ' Leads the Field',
    dek:'Our results-first model ranks all FBS programs from completed NCAA game evidence through ' + dateLabel(ranking.evidence_through_at) + ', with opponent strength, capped scoring margins, venue, recent form and uncertainty kept visible.',
    desk:'Sports',
    story_type:'Power Rankings',
    status:'draft',
    published_at:publishedAt,
    updated_at:publishedAt,
    freshness_expires_at:expiresAt,
    evidence_state:'model_derived_from_verified_public_results',
    sensitivity:{state:'public_unclassified', classified_detail_policy:'do_not_infer_or_expand'},
    sources:[
      {
        source_id:'ncaa-fbs-scoreboard',
        label:'NCAA FBS football scores',
        publisher:'NCAA',
        url:'https://www.ncaa.com/scoreboard/football/fbs',
        evidence_state:'verified',
      },
      {
        source_id:'ncaa-fbs-scoreboard-data',
        label:'NCAA FBS 2026 scoreboard data query',
        publisher:'NCAA',
        url:dataUrl,
        evidence_state:'public_source',
      },
    ],
    claims:[
      {
        claim:'The ranking evidence ledger contains ' + ledger.games.length + ' completed games through ' + throughDay + '.',
        evidence_state:'verified',
        source_refs:['ncaa-fbs-scoreboard','ncaa-fbs-scoreboard-data'],
      },
      {
        claim:leader.team_name + ' ranks No. 1 in Evercraft CFBPI run ' + ranking.run_id + ', ahead of ' + runnerUp.team_name + '.',
        evidence_state:'verified',
        source_refs:['ncaa-fbs-scoreboard-data'],
      },
    ],
    ranking_table:{
      schema:'evercraft.journal.ranking-table.v1',
      title:'Evercraft Top 25',
      note:'Model ' + (ranking.model?.model_version || 'unknown') + ' | evidence through ' + throughDay,
      rows:top25.map(row => ({
        rank:row.rank,
        team_name:row.team_name,
        record:{wins:row.record.wins, losses:row.record.losses},
        movement:row.movement,
        power_score:row.power_score,
        confidence:row.confidence,
      })),
    },
    sections:[
      {
        heading:'What the model sees right now',
        body:'The first five positions in this edition are ' + topNames(top25, 5) + '. This is not a ballot and it is not designed to copy one. The ordering comes from the season ledger attached to ranking run ' + ranking.run_id + '. Completed results are adjusted for opponent strength and designated venue, scoring margins are capped so one demolition cannot own an entire résumé, and the most recent games matter without erasing the rest of the season. The top line is therefore a snapshot of demonstrated team strength through the evidence cutoff, not a prediction that the current order will survive the next Saturday.',
      },
      {
        heading:'Why ' + leader.team_name + ' is No. 1',
        body:leader.team_name + ' is ' + recordLabel(leader) + ' and owns a Power Score of ' + leader.power_score.toFixed(2) + ' with ' + Math.round(leader.confidence * 100) + ' percent model confidence. Its current component profile combines a result-quality score of ' + Number(leader.components.result_quality).toFixed(1) + ', opponent-adjusted efficiency of ' + Number(leader.components.efficiency).toFixed(1) + ', schedule strength of ' + Number(leader.components.schedule_strength).toFixed(1) + ' and recent-form score of ' + Number(leader.components.recent_form).toFixed(1) + '. The important part is not any single number. The lead survives several independent pieces of the current results ledger rather than depending on poll reputation or one headline win.',
      },
      {
        heading:'Where uncertainty still lives',
        body:'This edition deliberately leaves availability and turnover-sustainability inputs unfilled when they are not backed by a governed evidence feed. Missing information is not converted into zero and modeled values are not labeled as observations. Every team therefore carries an explicit confidence value and a missing-component list in the machine-readable ranking receipt. That makes this edition more conservative than a ranking that quietly guesses at injuries, quarterback availability or turnover luck, and it gives future versions a clean place to improve as those evidence lanes become reliable.',
      },
      {
        heading:'What happens next',
        body:'The ranking is designed to move when the evidence moves. Each new completed-game ledger can be replayed against the same versioned model, compared with the prior published edition and scored later against what happened on the field. Future editions can add verified player availability, deeper efficiency measures and consensus-poll comparison without rewriting history. The goal is not to win an argument on publication day. It is to build a public record showing where Evercraft was early, where it was wrong and whether the model becomes more predictive as the season develops.',
      },
    ],
    uncertainty_notes:[
      'Player availability is not yet included unless a governed evidence feed is added.',
      'Turnover sustainability is intentionally missing in this edition rather than inferred.',
      'NCAA scoreboard data may designate home and away without exposing neutral-site state for every game.',
      'This is a power ranking derived from completed results, not a playoff selection projection.',
    ],
    production_grade:{
      status:'accepted',
      hero_kind:'data_visualization',
      text_primary:false,
      note:'The ranking surface is structured data. Fallen should build the social and motion visual package from the same Top 25 receipt.',
    },
    editorial_gate:{
      status:'pending',
      score:0,
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
      package_key:'journal:' + throughDay + ':cfb-power-rankings',
      mission_key:'evercraft-cfb-power-rankings',
      work_key:'cfb-power-rankings-' + throughDay + '-visual-package',
      story:{
        title:'Evercraft College Football Power Rankings: ' + leader.team_name + ' Leads the Field',
        thesis:leader.team_name + ' leads a results-first Evercraft Top 25 built from NCAA evidence through ' + throughDay + '.',
        education_goal:'Show the ranking clearly, make movement and uncertainty legible, and give each derivative one canonical source article.',
        desk:'sports',
      },
      evidence:{
        source_refs:['ncaa-fbs-scoreboard','ncaa-fbs-scoreboard-data'],
        evidence_refs:[ranking.evidence_snapshot_id,ranking.run_id],
        evidence_state:'model_derived_from_verified_public_results',
        confidence:'bounded_by_team_level_confidence',
        freshness_state:'fresh',
        uncertainty_notes:'Availability and turnover-sustainability inputs remain missing rather than guessed.',
      },
      rights:{visual_rights_state:'not_required'},
      derivative_plan:[
        {format:'social_square', angle:'Top 10 with Power Score and movement'},
        {format:'instagram_carousel', angle:'Top 25 in five clean ranking panels'},
        {format:'youtube_short', angle:'The five teams Evercraft rates highest right now'},
        {format:'linkedin', angle:'How a receipt-backed sports ranking differs from a ballot'},
      ],
      visual_story:{
        id:'cfb-power-rankings-' + throughDay,
        headline:'Evercraft College Football Power Rankings',
        subhead:'Evidence through ' + throughDay,
        durationSec:35,
        aspectRatio:'9:16',
        metrics:top25.slice(0,5).map(row => ({
          id:row.team_id,
          label:'#' + row.rank + ' ' + row.team_name,
          value:row.power_score,
          unit:'Power Score',
          evidenceState:'modeled_from_public_results',
          sourceRefs:row.source_refs,
        })),
      },
    },
    derivatives:[
      {
        platform:'facebook',
        copy:'The Evercraft College Football Power Rankings are live for ' + throughDay + '. ' + leader.team_name + ' is No. 1, but the bigger story is the method: completed results, opponent strength, capped margins and visible uncertainty instead of a copied ballot.',
      },
      {
        platform:'linkedin',
        copy:'We built our college football power ranking as a replayable evidence product rather than a one-off opinion list. Every position traces back to the same completed-game ledger and versioned model, with missing inputs left missing instead of silently guessed.',
      },
      {
        platform:'youtube_short',
        hook:leader.team_name + ' is No. 1 in Evercraft College Football Power Rankings. Here are the five teams our results model trusts most right now.',
        duration_sec:45,
      },
    ],
  };
}

async function main(){
  const rankingPath = process.argv[2] || '_cfb_power_run/cfb-power-rankings.json';
  const ledgerPath = process.argv[3] || '_cfb_power_run/completed-games.json';
  const outputPath = process.argv[4] || '_cfb_power_run/journal-story-draft.json';
  const ranking = JSON.parse(fs.readFileSync(rankingPath, 'utf8'));
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
  const story = buildCfbPowerStoryDraft({ranking, ledger});
  fs.mkdirSync(path.dirname(outputPath), {recursive:true});
  fs.writeFileSync(outputPath, JSON.stringify(story, null, 2) + '\n');
  console.log(JSON.stringify({
    schema:'evercraft.cfb.story-draft-receipt.v1',
    story_id:story.story_id,
    slug:story.slug,
    status:story.status,
    output:outputPath
  }, null, 2));
}
if(process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href){
  await main();
}
