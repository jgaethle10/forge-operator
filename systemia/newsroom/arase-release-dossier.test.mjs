import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {auditAraseRelease,renderDossierMarkdown,writeAraseDossier} from './arase-release-dossier.mjs';

const markdown=fs.readFileSync(new URL('./editorial-queue/2026-10-31-arase-radiation-barrier.md',import.meta.url),'utf8');
const claimInput=JSON.parse(fs.readFileSync(new URL('./editorial-queue/2026-11-15-arase-claim-input.json',import.meta.url),'utf8'));
const media=JSON.parse(fs.readFileSync(new URL('./editorial-assets/arase-may-2024-storm-media.json',import.meta.url),'utf8'));
const rights=JSON.parse(fs.readFileSync(new URL('./editorial-assets/arase-photo-rights-review-20261115.json',import.meta.url),'utf8'));
const index=JSON.parse(fs.readFileSync(new URL('../../public/journal/index.json',import.meta.url),'utf8'));
const args=()=>({markdown,claimInput:structuredClone(claimInput),media:structuredClone(media),rights:structuredClone(rights),index:structuredClone(index)});

test('Arase report verifies six evidence-backed claims but issues no fake approval',()=>{
 const r=auditAraseRelease(args());
 assert.equal(r.schema,'evercraft.journal.arase-release-dossier.v1');
 assert.equal(r.evidence.preflight_ready,true);
 assert.equal(r.evidence.claim_count,6);
 assert.equal(r.evidence.evidence_count,6);
 assert.equal(r.publication_authority,false);
 assert.equal(r.editorial_approval,false);
 assert.equal(r.systemia_release_receipt,null);
 assert.equal(r.clip_authorization,false);
 assert.equal(r.photo.release_approved,false);
 assert.ok(r.pending.some(g=>g.name==='independent_editorial_10_of_10'&&g.state==='pending'));
 assert.ok(r.pending.some(g=>g.name==='exact_photo_rights'&&g.state==='pending'));
 assert.equal(r.stage,'science_preflight_passed_publication_pending');
 assert.match(r.title,/Particle Accelerator/);
 assert.doesNotMatch(r.title,/made its own radiation/i);
});
test('current unrelated Journal article never makes Arase look published',()=>{
 const r=auditAraseRelease(args());
 assert.equal(r.journal.arase_in_current_edition,false);
 assert.equal(r.journal.arase_in_archive,false);
 const fake=args();
 fake.index.stories=[{story_id:'journal:2026-10-31:arase-radiation-barrier',canonical_url:'https://fabric.systemiacommandcenters.com/journal/arase-radiation-barrier-local-acceleration/'}];
 const speculative=auditAraseRelease(fake);
 assert.equal(speculative.publication_authority,false);
 assert.equal(speculative.editorial_approval,false);
 assert.equal(speculative.checks.find(x=>x.name==='public_canonical_delivery').state,'source_index_lists_story_unverified');
});
test('does not accept missing primary paper, broadened 5000-fold figure or a fake review',()=>{
 const badPaper=args();
 badPaper.claimInput.sources.find(s=>s.source_id==='arase-peer-reviewed').url='https://example.org/';
 assert.throws(()=>auditAraseRelease(badPaper),/primary_paper_missing/);
 const badFlux=args();
 badFlux.claimInput.claims.find(c=>c.claim_id==='c:factor').claim='Every electron increased more than 5000-fold';
 assert.throws(()=>auditAraseRelease(badFlux),/flux_scope_invalid/);
 const fakeRights=args();
 fakeRights.rights.preliminary_decision.visual_rights_state='verified';
 assert.throws(()=>auditAraseRelease(fakeRights),/photo_rights_claim_not_independently_reviewed/);
});
test('rejects source-asset drift and uncited claims without granting rights',()=>{
 const badPhoto=args();badPhoto.rights.original_photo.sha256='a'.repeat(64);
 assert.throws(()=>auditAraseRelease(badPhoto),/photo_source_identity_changed/);
 const unsupported=args();
 unsupported.claimInput.claims.find(c=>c.claim_id==='c:observations').supporting_evidence_refs=['e:unverified'];
 assert.throws(()=>auditAraseRelease(unsupported),/Unknown claim evidence reference/);
});
test('writes a private review report and human-readable release actions outside repo only',()=>{
 const report=auditAraseRelease(args());
 const md=renderDossierMarkdown(report);
 assert.match(md,/SCIENCE PREFLIGHT PASSED/);
 assert.match(md,/NASA|photo|rights/);
 assert.match(md,/independent editorial acceptance/);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'arase-dossier-test-'));
 const output=path.join(dir,'release-dossier.json');
 const result=writeAraseDossier({...args(),output});
 assert.equal(result.release_authorized,false);
 assert.match(result.report_sha256,/^[a-f0-9]{64}$/);
 const reread=JSON.parse(fs.readFileSync(output,'utf8'));
 assert.equal(reread.publication_authority,false);
 assert.ok(fs.existsSync(result.review_notes));
 assert.throws(()=>writeAraseDossier({...args(),output:path.join(path.resolve(new URL('../..',import.meta.url).pathname),'public/journal/fake.json')}),/must_be_private_json/);
});
