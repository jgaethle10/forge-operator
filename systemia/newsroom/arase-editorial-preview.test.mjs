import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {extractScienceCandidate,verifyScienceCandidate,renderScienceCandidate,stageScienceCandidatePackage,approvedProofPath,createScienceProof} from './arase-editorial-preview.mjs';
import {validateJournalStory} from './journal-publisher.mjs';

const markdown=fs.readFileSync(new URL('./editorial-queue/2026-10-31-arase-radiation-barrier.md',import.meta.url),'utf8');
const manifest=JSON.parse(fs.readFileSync(new URL('./editorial-assets/arase-may-2024-storm-media.json',import.meta.url),'utf8'));
const repo=path.resolve(new URL('../..',import.meta.url).pathname);

test('extracts a substantive Arase article from original unapproved source, not a fabricated live story',()=>{
 const article=extractScienceCandidate(markdown);
 assert.match(article.title,/Impenetrable/);
 assert.ok(article.sections.length>=5);
 assert.ok(article.article.split(/\s+/).length>500);
 assert.equal(verifyScienceCandidate(markdown,manifest).title,article.title);
});
test('renders NASA photo with provenance, noindex and a prominent release hold',()=>{
 const html=renderScienceCandidate({markdown,manifest});
 assert.match(html,/name="robots" content="noindex,nofollow,noarchive"/);
 assert.match(html,/name="evercraft:publication_state" content="editorial_draft_only"/);
 assert.match(html,/Editorial proof · Not published/);
 assert.match(html,/NASA\/Mara Johnson-Groh/);
 assert.match(html,/svs\.gsfc\.nasa\.gov\/vis\//);
 assert.match(html,/<img[^>]+src="\.\/arase-aurora-review\.jpg"/);
 assert.doesNotMatch(html,/<img[^>]+src="https:\/\//);
 assert.match(html,/not Arase electron measurements/);
 assert.match(html,/Science &amp; Discovery/);
 assert.match(html,/aria-label="Story sections"/);
 assert.ok((html.match(/id="section-/g)||[]).length>=5);
 assert.doesNotMatch(html,/<script\b/);
});
test('rejects silently upgrading a rights-review candidate to publication approval',()=>{
 assert.throws(()=>renderScienceCandidate({markdown,manifest:{...manifest,publication_state:'approved'}}),/release_boundary/);
 assert.throws(()=>renderScienceCandidate({markdown,manifest:{...manifest,hero:{...manifest.hero,rights_review_status:'verified'}}}),/rights_release_boundary/);
});
test('refuses unbound claims and unrelated image hosts',()=>{
 const sources=manifest.sources.map(s=>({...s}));
 sources[0].url='https://example.com/nonexistent';
 assert.throws(()=>renderScienceCandidate({markdown,manifest:{...manifest,sources}}),/source_not_bound/);
 assert.throws(()=>renderScienceCandidate({markdown,manifest:{...manifest,hero:{...manifest.hero,image_url:'https://example.com/aurora.jpg'}}}),/image_source_not_verified/);
});
test('escapes untrusted prose and cannot render executable HTML',()=>{
 const injected=markdown.replace('In May 2024, an extraordinary solar storm','<script>alert(1)</script> In May 2024, an extraordinary solar storm');
 const output=renderScienceCandidate({markdown:injected,manifest});
 assert.ok(output.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
 assert.doesNotMatch(output,/<script>alert\(1\)<\/script>/);
});
test('stages a five-claim, source-bound review packet that cannot be passed to the publisher',()=>{
 const packet=stageScienceCandidatePackage({markdown,manifest});
 assert.equal(packet.schema,'evercraft.journal.editorial-candidate.v1');
 assert.equal(packet.status,'editorial_review_only');
 assert.equal(packet.publication_authorized,false);
 assert.equal(packet.editorial_gate.status,'pending');
 assert.equal(packet.editorial_gate.score,0);
 assert.equal(packet.hero_visual.rights_state,'candidate_not_approved_for_release');
 assert.ok(packet.claims.length>=4);
 assert.ok(packet.claims.every(c=>c.source_refs.every(ref=>packet.sources.some(s=>s.source_id===ref))));
 assert.throws(()=>validateJournalStory(packet),/Unsupported Journal story schema/);
});
test('writes proof outside repository only, without minting release authority',()=>{
 assert.throws(()=>approvedProofPath(path.join(repo,'public/journal/arase.html'),repo),/cannot_enter_repository/);
 assert.throws(()=>approvedProofPath(path.join(repo,'docs/arase.html'),repo),/cannot_enter_repository/);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'journal-arase-proof-'));
 const result=createScienceProof({markdown,manifest,output:path.join(dir,'arase.html')});
 assert.equal(result.release_authorized,false);
 assert.equal(result.clip_authorized,false);
 assert.equal(result.publication_state,'editorial_draft_only');
 assert.match(fs.readFileSync(result.output,'utf8'),/No distribution authorization/);
 assert.match(result.html_sha256,/^[a-f0-9]{64}$/);
 assert.match(result.packet_sha256,/^[a-f0-9]{64}$/);
 const packet=JSON.parse(fs.readFileSync(result.candidate_packet,'utf8'));
 assert.equal(packet.status,'editorial_review_only');
});
