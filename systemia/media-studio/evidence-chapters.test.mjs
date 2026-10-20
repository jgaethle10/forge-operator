import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {produceEvidenceChapters,validateEvidenceChapters} from './evidence-chapters.mjs';

const fixture=process.env.FALLEN_CHAPTERS_REAL_SOURCE_REQUEST;
if(!fixture)throw Error('fallen_chapters_real_gpu_source_fixture_required');
const original=JSON.parse(fs.readFileSync(fixture,'utf8'));
const clone=()=>structuredClone(original);
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fallen-chapter-evidence-'));
process.on('exit',()=>fs.rmSync(dir,{recursive:true,force:true}));
let counter=0;
const destination=()=>path.join(dir,'render-'+(++counter));
test('mathematically exact 15s / 360-frame narrative with source-aware shots',()=>{
 const contract=validateEvidenceChapters(clone());
 assert.equal(contract.expectedFrames,360);
 assert.equal(contract.expectedDurationSec,15);
 assert.equal(new Set(original.chapters.map(x=>x.intent)).size,3);
});
test('rejects unsupported historical authority, fake verified claims, and unapproved sound',()=>{
 const req=clone();req.chapters[1].evidenceState='verified_historical_fact';
 assert.throws(()=>validateEvidenceChapters(req),/fallen_chapters_historical_evidence_state_unverified/);
 const audio=clone();audio.audioPolicy='generated_music';
 assert.throws(()=>validateEvidenceChapters(audio),/fallen_chapters_unapproved_audio/);
 const brand=clone();brand.productionIntent='client_published_commercial';
 assert.throws(()=>validateEvidenceChapters(brand),/fallen_chapters_production_intent_invalid/);
});
test('rejects duplicated chapters, ungrounded camera, impossible trims and unsafe overlaps',()=>{
 for(const mutation of [
  q=>{q.chapters[1].id=q.chapters[0].id;},
  q=>{q.chapters[2].intent='imaginary_view';},
  q=>{q.chapters[2].inFrame=90;},
  q=>{q.transitionFrames=80;},
  q=>{q.chapters=q.chapters.slice(0,2);}
 ]){
  const req=clone();mutation(req);
  assert.throws(()=>validateEvidenceChapters(req),/fallen_chapters_/);
 }
});
test('detects GPU source substitution before rendering a single chapter',()=>{
 const req=clone();req.shots[2].sha256='0'.repeat(64);
 assert.throws(()=>produceEvidenceChapters(req,destination()),/fallen_storyboard_source_sha256_mismatch_title_safe/);
});
test('produces real five-chapter, evidence-labeled 15-second H264 film with original GPU scene lineage',()=>{
 const r=produceEvidenceChapters(clone(),destination());
 assert.equal(r.schema,'evercraft.fallen.evidence-chapters-receipt.v1');
 assert.equal(r.chapters.length,5);
 assert.equal(r.output.durationSec,15);
 assert.equal(r.output.frames,360);
 assert.equal(r.output.width,640);
 assert.equal(r.output.height,360);
 assert.equal(r.output.audioPresent,false);
 assert.equal(r.transition.frames,9);
 assert.equal(r.sourceProofs.length,3);
 assert.equal(r.status,'INTERNAL_REVIEW_ONLY');
 assert.equal(r.protections.releaseApproval,false);
 assert.equal(r.protections.noHistoricalObservationClaim,true);
 assert.equal(r.protections.sourceSha256Verified,true);
 assert.equal(r.protections.editorialClaimsNotFactChecked,true);
 assert.equal(r.stills.length,5);
 assert.ok(new Set(r.stills.map(x=>x.sha256)).size>=3);
 assert.ok(r.chapters.every(x=>x.worldShotDigest===r.sourceProofs.find(s=>s.intent===x.intent).sourceVideoSha256));
 const outputDir=path.join(dir,'render-'+counter);
 const video=fs.readFileSync(path.join(outputDir,r.output.file));
 assert.equal(crypto.createHash('sha256').update(video).digest('hex'),r.output.sha256);
 assert.ok(video.length>60000);
});
