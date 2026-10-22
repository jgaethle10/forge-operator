import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {evaluateEp01Opening} from './ep01-first-210s-gate.mjs';
const load=p=>JSON.parse(fs.readFileSync(new URL('./'+p,import.meta.url),'utf8'));
const p=load('ep01-first-210s.plan.json'),s=load('series.sources.json');
test('chronological 3m30 original-source edit is a development plan, not a release',()=>{
 const r=evaluateEp01Opening(p,s);
 assert.equal(r.status,'source_locked_no_publication_authority',r.errors.join(';'));
 assert.equal(r.seconds,210);assert.equal(r.beats,8);
 assert.ok(r.knownSourceIds>=12);assert.ok(r.blockedSourceReferences>=14);
 assert.equal(r.filmRenderProduced,false);assert.equal(r.sourceRightsReady,false);
});
test('1971 Missouri film cannot be substituted for 1971 Nebraska Oklahoma matchup',()=>{
 const x=structuredClone(p);x.beats[4].visual='1971 Missouri footage is the Nebraska Oklahoma final';
 assert.ok(evaluateEp01Opening(x,s).errors.includes('missouri_game_misrepresented_as_oklahoma'));
});
test('historic championship scores and 1971 versus 1972 dates fail closed',()=>{
 const x=structuredClone(p);x.beats[3].fact='Nebraska beat LSU 20-13 in 1972';
 assert.ok(evaluateEp01Opening(x,s).errors.includes('1970_title_and_1971_ceremony_not_fact_pinned'));
 const y=structuredClone(p);y.beats[5].fact='Nebraska beat Alabama 30-6';
 assert.ok(evaluateEp01Opening(y,s).errors.includes('1971_title_result_and_1972_meeting_not_pinned'));
});
test('cannot invent rights, speech, movie footage or coach quote to make a film appear complete',()=>{
 const x=structuredClone(p);x.publicationAuthorityGranted=true;
 assert.ok(evaluateEp01Opening(x,s).errors.includes('unearned_completion_or_distribution_claim'));
 const y=structuredClone(p);y.noSyntheticHistoricVideo=false;
 assert.ok(evaluateEp01Opening(y,s).errors.includes('false_historical_motion_or_audio_allowed'));
});
test('a missing original archive ID is not papered over by footage title',()=>{
 const x=structuredClone(p);x.beats[0].sourceIds=['pretend-1919-film'];
 assert.ok(evaluateEp01Opening(x,s).errors.includes('unregistered_source:pretend-1919-film'));
});
