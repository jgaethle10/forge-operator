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
function movementSection(top25){
  const changed=top25.filter(row=>Number.isFinite(Number(row.movement))&&Number(row.movement)!==0);
  if(!changed.length) return null;
  const risers=[...changed].filter(row=>Number(row.movement)>0)
    .sort((a,b)=>Number(b.movement)-Number(a.movement)||Number(a.rank)-Number(b.rank));
  const fallers=[...changed].filter(row=>Number(row.movement)<0)
    .sort((a,b)=>Number(a.movement)-Number(b.movement)||Number(a.rank)-Number(b.rank));
  const describe=(rows,direction)=>rows.slice(0,4).map(row=>{
    const amount=Math.abs(Number(row.movement));
    return row.team_name+' '+direction+' '+amount+' to No. '+row.rank;
  }).join('; ');
  const parts=[];
  if(risers.length) parts.push('Risers: '+describe(risers,'up'));
  if(fallers.length) parts.push('Fallers: '+describe(fallers,'down'));
  return {
    heading:'Movement since the last edition',
    body:parts.join('. ')+'. Movement is computed against the latest strictly earlier persisted Evercraft edition, so a rerun of the same evidence window cannot manufacture a new arrow.',
  };
}
function pollComparisonSection(comparison){
  if(!comparison) return null;
  if(comparison.schema!=='evercraft.cfb.poll-comparison.v1') throw new Error('cfb_story_poll_comparison_schema_invalid');
  if(comparison.authority_boundary?.poll_used_as_model_input!==false||comparison.authority_boundary?.comparison_only!==true){
    throw new Error('cfb_story_poll_comparison_authority_invalid');
  }
  const rows=(comparison.largest_disagreements||[]).slice(0,5);
  if(!rows.length) return null;
  const wording=rows.map(row=>{
    const gap=Math.abs(Number(row.rank_delta));
    const direction=Number(row.rank_delta)>0?'higher':'lower';
    return row.team_name+' '+gap+' spots '+direction+' (Evercraft No. '+row.evercraft_rank+', '+comparison.poll.poll_name+' No. '+row.poll_rank+')';
  }).join('; ');
  return {
    heading:'Where Evercraft disagrees with '+comparison.poll.poll_name,
    body:'Against the '+comparison.poll.poll_name+' published '+dateLabel(comparison.poll.published_date)+', the largest current gaps are: '+wording+'. These disagreements are frozen for later accountability. They are not evidence that Evercraft or the poll is already correct, and the poll is never used as an input to the Power Index.',
  };
}

export function buildCfbPowerStoryDraft({
  ranking,
  ledger,
  generatedAt = new Date().toISOString(),
  freshnessHours = 168,
  pollComparison = null,
} = {}){
  if(ranking?.schema !== 'evercraft.cfb-power-rankings.v1') throw new Error('cfb_story_ranking_schema_invalid');
  if(!['evercraft.cfb.completed-game-ledger.v1','evercraft.cfb.completed-game-ledger.v2'].includes(ledger?.schema)) throw new Error('cfb_story_ledger_schema_invalid');
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
  if(pollComparison&&clean(pollComparison.ranking_run_id)!==clean(ranking.run_id)){
    throw new Error('cfb_story_poll_comparison_run_mismatch');
  }
  const movement = movementSection(top25);
  const pollSection = pollComparisonSection(pollComparison);
  const sections = [
      {
        heading:'What the model sees right now',
        body:'The first five positions in this edition are ' + topNames(top25, 5) + '. This is not a ballot and it is not designed to copy one. The ordering comes from the season ledger attached to ranking run ' + ranking.run_id + '. Completed results are adjusted for opponent strength and designated venue, scoring margins are capped so one demolition cannot own an entire résumé, and the most recent games matter without erasing the rest of the season. The top line is therefore a snapshot of demonstrated team strength through the evidence cutoff, not a prediction that the current order will survive the next Saturday.',
      },
      movement,
      pollSection,
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
        body:'The ranking is designed to move when the evidence moves. Each new completed-game ledger can be replayed against the same versioned model, compared with the prior published edition and scored later against what happened on the field. Verified player availability and deeper efficiency measures can be added as governed evidence lanes without rewriting history. The comparison and accountability ledgers preserve where Evercraft disagreed with consensus and whether those directional calls held up later. The goal is not to win an argument on publication day. It is to build a public record showing where Evercraft was early, where it was wrong and whether the model becomes more predictive as the season develops.',
      },
    ].filter(Boolean);

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
        source_id:'evercraft-cfb-edition-evidence',
        label:'Frozen Evercraft CFBPI edition evidence',
        publisher:'Evercraft Journal',
        url:'https://fabric.systemiacommandcenters.com/journal/data/' + slug + '.json',
        evidence_state:'verified',
      },
      ...(pollComparison?[{
        source_id:'cfb-poll-baseline-' + pollComparison.poll.poll_id,
        label:pollComparison.poll.poll_name + ' comparison baseline published ' + pollComparison.poll.published_date,
        publisher:pollComparison.poll.source_authority,
        url:pollComparison.poll.source_url,
        evidence_state:'verified_comparison_only',
      }]:[]),
    ],
    machine_evidence:{
      schema:'evercraft.journal.machine-evidence.v1',
      relative_path:'data/' + slug + '.json',
      payload:{
        schema:'evercraft.cfb.edition-evidence.v1',
        ranking,
        poll_comparison:pollComparison,
        ledger:{
          schema:ledger.schema,
          source:ledger.source,
          source_authority:ledger.source_authority || null,
          season:ledger.season || ranking.season,
          start_date:ledger.start_date || null,
          end_date:ledger.end_date || ledger.through_date || throughDay,
          through_date:ledger.through_date || throughDay,
          fetched_weeks:ledger.fetched_weeks || null,
          membership:ledger.membership || null,
          source_urls:ledger.source_urls,
          completed_game_count:ledger.games.length,
          games:ledger.games,
        },
      },
    },
    claims:[
      {
        claim:'The ranking evidence ledger contains ' + ledger.games.length + ' completed games through ' + throughDay + '.',
        evidence_state:'verified',
        source_refs:[
          'ncaa-fbs-scoreboard',
          'evercraft-cfb-edition-evidence',
          ...(pollComparison?['cfb-poll-baseline-' + pollComparison.poll.poll_id]:[]),
        ],
      },
      {
        claim:leader.team_name + ' ranks No. 1 in Evercraft CFBPI run ' + ranking.run_id + ', ahead of ' + runnerUp.team_name + '.',
        evidence_state:'verified',
        source_refs:['evercraft-cfb-edition-evidence'],
      },
      ...(pollComparison&&pollComparison.largest_disagreements?.length?[{
        claim:'Evercraft and ' + pollComparison.poll.poll_name + ' differ by at least ' + pollComparison.largest_disagreements[0].absolute_gap + ' ranking positions on ' + pollComparison.largest_disagreements[0].team_name + ' in this frozen comparison.',
        evidence_state:'verified_comparison_only',
        source_refs:['evercraft-cfb-edition-evidence','cfb-poll-baseline-' + pollComparison.poll.poll_id],
      }]:[]),
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
    sections,
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
        source_refs:['ncaa-fbs-scoreboard','evercraft-cfb-edition-evidence'],
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
        ...(pollComparison?[{format:'social_square', angle:'Largest Evercraft versus '+pollComparison.poll.poll_name+' ranking gaps'}]:[]),
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
  const pollComparisonPath = process.argv[5] || '';
  const ranking = JSON.parse(fs.readFileSync(rankingPath, 'utf8'));
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
  const pollComparison = pollComparisonPath ? JSON.parse(fs.readFileSync(pollComparisonPath,'utf8')) : null;
  const story = buildCfbPowerStoryDraft({ranking, ledger, pollComparison});
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
