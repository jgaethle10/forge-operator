import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {inspectNebraskaSeries,inspectNebraskaHistory} from './series-production-gate.mjs';
const read=(name)=>JSON.parse(fs.readFileSync(new URL('./'+name,import.meta.url),'utf8'));
const season=read('series.season1.json'),sources=read('series.sources.json'),history=read('history.evidence.json');
const evaluate=(a=season,b=sources,c=history)=>inspectNebraskaSeries(a,b,c);

test('program rise, sleeping giant, Rhule rebuild are three real 25 minute outlines, not 75 minutes of finished film',()=>{
 const r=evaluate();
 assert.equal(r.status,'structure_passed_sources_and_rights_blocked',r.errors.join('|'));
 assert.equal(r.targetMinutes,75);
 assert.equal(r.episodeCount,3);
 assert.equal(r.sceneCount,18);
 assert.equal(r.acquiredHashVerifiedSources,4);
 assert.equal(r.historicalFactsWithSourceLinks,19);
 assert.deepEqual(r.episodes.map(e=>e.title),['The Giant','The Sleeping Giant','The Giant Stirs']);
 assert.ok(r.episodes.every(e=>e.draftMinutes===25&&e.availableForPublicFilmMinutes===0&&!e.humanDirectorAcceptance));
});

test('reject changing episode one from origin, 1970s dynasty and 1990s title footage to current season montage',()=>{
 const x=structuredClone(season);x.episodes[0].historicalCoverage=['2026'];
 assert.ok(evaluate(x).errors.includes('historical_era_coverage_missing:ep01'));
 const y=structuredClone(season);y.episodes[0].acts[3].requiredSourceIds=['oregon-2026-game-film'];
 assert.ok(evaluate(y).errors.includes('core_historical_visual_or_interview_missing:ep01'));
});
test('reject pretending the post-Osborne dark days omit Solich, Pelini, Riley or Frost',()=>{
 const x=structuredClone(season);x.episodes[1].acts[4].requiredSourceIds=['younger-supporter-interview'];
 assert.ok(evaluate(x).errors.includes('core_historical_visual_or_interview_missing:ep02'));
 const y=structuredClone(season);y.episodes[1].title='Ten Seconds';
 assert.ok(evaluate(y).errors.includes('history_decline_revival_arc_replaced'));
});
test('reject propaganda that cuts Rhule 2024/2025 record or still-uncleared Indiana Oregon footage',()=>{
 const x=structuredClone(season);x.episodes[2].acts[2].requiredSourceIds=['independent-reporter-context'];
 assert.ok(evaluate(x).errors.includes('core_historical_visual_or_interview_missing:ep03'));
 const y=structuredClone(season);y.episodes[2].acts[3].requiredSourceIds=['2026-five-win-start'];
 assert.ok(evaluate(y).errors.includes('core_historical_visual_or_interview_missing:ep03'));
});
test('historical ledger protects the difference between nine-win Pelini tenure and later losing eras',()=>{
 const x=structuredClone(history);x.claims.find(c=>c.id==='pelini-not-blanket-failure').statement='Every Pelini year was a losing season';
 assert.ok(inspectNebraskaHistory(x).includes('historical_anchor_missing_or_changed:pelini-not-blanket-failure'));
 const y=structuredClone(history);y.claims.find(c=>c.id==='2002-season-fall').statement='Nebraska dominated every year';
 assert.ok(inspectNebraskaHistory(y).includes('historical_anchor_missing_or_changed:2002-season-fall'));
});
test('historical championship and Rhule improvement dates require attributed historical evidence',()=>{
 const x=structuredClone(history);x.claims.find(c=>c.id==='three-nineties-titles').statement='Six crowns since 2000';
 assert.ok(inspectNebraskaHistory(x).includes('historical_anchor_missing_or_changed:three-nineties-titles'));
 const y=structuredClone(history);y.claims.find(c=>c.id==='2024-bowl-breakthrough').sources=[];
 assert.ok(inspectNebraskaHistory(y).includes('historical_claim_unattributed:2024-bowl-breakthrough'));
});
test('an approved publication or completed episode claim cannot be manufactured from a good outline',()=>{
 const x=structuredClone(season);x.publication.episode1Approved=true;
 assert.ok(evaluate(x).errors.includes('publication_or_release_authority_claimed'));
 const y=structuredClone(season);y.episodes[2].productionStage='finished_and_published';
 assert.ok(evaluate(y).errors.includes('episode_unearned_completion_claim:ep03'));
});
test('cannot invent Washington, November or final 2026 season outcomes',()=>{
 const x=structuredClone(season);x.currentSeason.nextKnownGame.result='Nebraska wins';
 assert.ok(evaluate(x).errors.includes('2026_record_future_game_or_season_truth_changed'));
 const y=structuredClone(season);y.currentSeason.seasonComplete=true;
 assert.ok(evaluate(y).errors.includes('2026_record_future_game_or_season_truth_changed'));
 const z=structuredClone(season);z.episodes[2].acts[4].requiredSourceIds=['independent-reporter-context'];
 assert.ok(evaluate(z).errors.includes('finale_cannot_be_fixed_without_future_season_events'));
});
test('cannot pad runtime or cite a nonexistent player interview',()=>{
 const x=structuredClone(season);x.episodes[0].acts[0].durationSec+=15;
 assert.ok(evaluate(x).errors.some(e=>e.startsWith('scene_sum_not_episode_target:ep01')));
 const y=structuredClone(season);y.episodes[1].acts[4].requiredSourceIds=['pretend-interview'];
 assert.ok(evaluate(y).errors.includes('unregistered_required_source:ep02:pretend-interview'));
 const z=structuredClone(season);z.episodes[0].acts[1].requiredSourceIds=[];
 assert.ok(evaluate(z).errors.includes('scene_with_no_source_requirement:ep01:the-first-century'));
});
test('public domain catalog entry does not silently permit commercial archive distribution',()=>{
 const x=structuredClone(sources);x.sources.find(s=>s.id==='history-nebraska-rg6137').publicationEligible=true;
 assert.ok(evaluate(season,x).errors.includes('source_publication_unreviewed_claim:history-nebraska-rg6137'));
 const y=structuredClone(sources);y.sources.find(s=>s.id==='nara-1973-spring-crowd').permissionReceiptId='unverified';
 assert.ok(evaluate(season,y).errors.includes('source_has_unverified_permission_or_editorial_receipt:nara-1973-spring-crowd'));
});
test('source hashes and legal review cannot be substituted by titles and unsourced historical claims',()=>{
 const x=structuredClone(sources);delete x.sources.find(s=>s.id==='lincoln-sky-2011').sha1;
 assert.ok(evaluate(season,x).errors.includes('claimed_verified_source_without_digest:lincoln-sky-2011'));
 const y=structuredClone(history);y.publicationAuthorityGranted=true;
 assert.ok(inspectNebraskaHistory(y).includes('history_research_grants_no_media_rights'));
});
test('old Ten Seconds chapter may remain but is no longer the whole documentary premise',()=>{
 const x=structuredClone(season);x.workingFilmReferences[1].possiblePlacement='ep02-primary-story';
 assert.ok(evaluate(x).errors.includes('old_2026_chapter_still_driving_entire_series'));
 const y=structuredClone(season);y.workingFilmReferences[0].status='published_on_social';
 assert.ok(evaluate(y).errors.includes('native_review_proof_missing_or_called_release_ready'));
});
