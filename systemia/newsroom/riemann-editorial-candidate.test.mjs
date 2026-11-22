import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { runEditorialClaimPreflight } from './editorial-claim-preflight.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const base = path.join(dir, 'editorial-queue');
const claim = JSON.parse(fs.readFileSync(path.join(base,'2026-11-21-riemann-hypothesis-claim-input.json'),'utf8'));
const manuscript = fs.readFileSync(path.join(base,'2026-11-21-riemann-hypothesis-certified.md'),'utf8');

test('Riemann editorial candidate is fully source-bound, but grants no publishing authority',()=>{
 const result=runEditorialClaimPreflight(claim);
 assert.equal(result.candidate_state,'awaiting_independent_editorial_review');
 assert.equal(result.evidence_preflight_ready,true);
 assert.deepEqual(result.publication_blockers,[]);
 assert.equal(result.source_count,8);
 assert.equal(result.evidence_count,8);
 assert.equal(result.claim_count,8);
 assert.equal(result.publication_authority,false);
 assert.equal(result.public_article_status,'not_published');
 assert.equal(result.editorial_gate.status,'not_accepted');
 assert.equal(result.systemia_publication_release,null);
 assert.equal(result.journal_publication_receipt,null);
 assert.ok(result.next_gates.includes('independent_editorial_10_of_10'));
 assert.ok(result.next_gates.includes('systemia_signed_publication_release'));
});
test('Riemann source corrections retain the certification/Clay difference and partial human guide',()=>{
 assert.match(manuscript,/EDITORIAL CANDIDATE \| Independent Review Pending \| Not Published/);
 assert.match(manuscript,/Lean and Mathlib communities certified/);
 assert.match(manuscript,/Clay Mathematics Institute still lists/);
 assert.match(manuscript,/164-page working guide/);
 assert.match(manuscript,/central inequality from the Lean development/);
 assert.match(manuscript,/alpo\.ge\/remark\.pdf/);
 assert.match(manuscript,/math\.mit\.edu\/\~drew\/grh/);
 assert.doesNotMatch(manuscript,/No human being has read the proof|no human-readable version of the proof exists yet/i);
});
test('source packet cannot silently self-authorize or reframe a formal proof as Clay prize acceptance',()=>{
 assert.equal(Object.hasOwn(claim,'status'),false);
 assert.equal(Object.hasOwn(claim,'editorial_gate'),false);
 assert.equal(Object.hasOwn(claim,'publication_authority'),false);
 assert.ok(claim.unresolved.some(s=>/Clay.*institutional status/i.test(s)));
 assert.ok(claim.unresolved.some(s=>/quot|verbatim/i.test(s)));
 assert.ok(claim.sources.some(s=>s.source_id==='lean-mathlib-joint'&&s.primary===true));
});
