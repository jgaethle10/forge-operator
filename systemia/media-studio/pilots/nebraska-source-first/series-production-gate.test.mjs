import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {inspectNebraskaSeries} from './series-production-gate.mjs';
const season=JSON.parse(fs.readFileSync(new URL('./series.season1.json',import.meta.url),'utf8'));
const sources=JSON.parse(fs.readFileSync(new URL('./series.sources.json',import.meta.url),'utf8'));
const evaluate=(a=season,b=sources)=>inspectNebraskaSeries(a,b);
test('three complete 25 minute target structures remain honest that zero finished episodes exist',()=>{
 const r=evaluate();
 assert.equal(r.status,'structure_passed_sources_and_rights_blocked',r.errors.join('|'));
 assert.equal(r.targetMinutes,75);
 assert.equal(r.episodeCount,3);
 assert.equal(r.sceneCount,18);
 assert.equal(r.acquiredHashVerifiedSources,4);
 assert.ok(r.episodes.every(e=>e.draftMinutes===25 && e.availableForPublicFilmMinutes===0 && !e.humanDirectorAcceptance));
});
test('unapproved publication or episode completion fails even if the structure has enough time',()=>{
 const x=structuredClone(season);x.publication.episode1Approved=true;
 assert.ok(evaluate(x).errors.includes('publication_or_release_authority_claimed'));
 const y=structuredClone(season);y.episodes[2].productionStage='finished_and_published';
 assert.ok(evaluate(y).errors.includes('episode_unearned_completion_claim:ep03'));
});
test('do not invent game results before Washington or the completed season',()=>{
 const x=structuredClone(season);x.currentSeason.nextKnownGame.result='Nebraska wins';
 assert.ok(evaluate(x).errors.includes('2026_record_future_game_or_season_truth_changed'));
 const y=structuredClone(season);y.currentSeason.seasonComplete=true;
 assert.ok(evaluate(y).errors.includes('2026_record_future_game_or_season_truth_changed'));
});
test('episode three cannot drop Washington, November or final outcome question',()=>{
 const x=structuredClone(season);
 x.episodes[2].acts[1].requiredSourceIds=['indiana-2026-game-film'];
 assert.ok(evaluate(x).errors.includes('finale_cannot_be_fixed_without_future_season_events'));
});
test('refuses padded scenes, dropped research interviews and missing source registrations',()=>{
 const x=structuredClone(season);
 x.episodes[0].acts[0].durationSec+=15;
 assert.ok(evaluate(x).errors.some(e=>e.startsWith('scene_sum_not_episode_target:ep01')));
 const y=structuredClone(season);
 y.episodes[1].acts[4].requiredSourceIds=['pretend-interview'];
 assert.ok(evaluate(y).errors.includes('unregistered_required_source:ep02:pretend-interview'));
 const z=structuredClone(season);
 z.episodes[0].acts[1].requiredSourceIds=[];
 assert.ok(evaluate(z).errors.includes('scene_with_no_source_requirement:ep01:the-place'));
});
test('a public domain claim never silently certifies collection publication permission',()=>{
 const s=structuredClone(sources);
 s.sources.find(x=>x.id==='history-nebraska-rg6137').publicationEligible=true;
 assert.ok(evaluate(season,s).errors.includes('source_publication_unreviewed_claim:history-nebraska-rg6137'));
 const t=structuredClone(sources);t.sources.find(x=>x.id==='nara-1973-spring-crowd').permissionReceiptId='unverified';
 assert.ok(evaluate(season,t).errors.includes('source_has_unverified_permission_or_editorial_receipt:nara-1973-spring-crowd'));
});
test('source hash integrity cannot be replaced with a title alone',()=>{
 const s=structuredClone(sources);
 const sky=s.sources.find(x=>x.id==='lincoln-sky-2011');delete sky.sha1;
 assert.ok(evaluate(season,s).errors.includes('claimed_verified_source_without_digest:lincoln-sky-2011'));
});
test('historical review footage must not be presented as distribution-ready',()=>{
 const x=structuredClone(season);x.workingFilmReferences[0].status='published_on_social';
 assert.ok(evaluate(x).errors.includes('native_review_proof_missing_or_called_release_ready'));
});
