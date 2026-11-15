import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {runEditorialClaimPreflight,validateEditorialClaimInput} from './editorial-claim-preflight.mjs';
import {validateJournalStory} from './journal-publisher.mjs';

const input=JSON.parse(fs.readFileSync(new URL('./editorial-queue/2026-11-15-arase-claim-input.json',import.meta.url),'utf8'));
const copy=()=>structuredClone(input);

test('Arase actual research claims pass source-bound preflight without being approved for publication',()=>{
 const result=runEditorialClaimPreflight(copy());
 assert.equal(result.story_id,'journal:2026-10-31:arase-radiation-barrier');
 assert.equal(result.source_count,5);
 assert.equal(result.evidence_count,6);
 assert.equal(result.claim_count,6);
 assert.equal(result.evidence_preflight_ready,true);
 assert.deepEqual(result.publication_blockers,[]);
 assert.ok(result.claim_reactor.claims.every(c=>c.ready_for_editorial_use));
 assert.ok(result.claim_reactor.claims.every(c=>c.evidence_status==='supported_by_cited_evidence'));
 assert.ok(result.claim_reactor.claims.every(c=>c.publication_authority===false));
 assert.equal(result.editorial_gate.status,'not_accepted');
 assert.equal(result.editorial_gate.score,null);
 assert.equal(result.systemia_publication_release,null);
 assert.equal(result.journal_publication_receipt,null);
 assert.equal(result.public_article_status,'not_published');
 assert.equal(result.clip_provider_receipts.length,0);
 assert.equal(result.publication_authority,false);
 assert.ok(result.next_gates.includes('independent_editorial_10_of_10'));
 assert.ok(result.next_gates.includes('systemia_signed_publication_release'));
 assert.throws(()=>validateJournalStory(input),/Unsupported Journal story schema/);
});

test('the dramatic 5000-fold figure is confined to an energy range, region, time and baseline',()=>{
 const fact=input.claims.find(c=>c.claim_id==='c:factor');
 assert.equal(fact.claim_type,'statistical');
 assert.match(fact.claim,/3,128-keV/);
 assert.match(fact.claim,/L\* < 3/);
 for(const key of ['time_period','geography','population','baseline'])assert.ok(fact[key]);
 const result=runEditorialClaimPreflight(copy());
 const reviewed=result.claim_reactor.claims.find(c=>c.claim_id==='c:factor');
 assert.deepEqual(reviewed.publication_blockers,[]);
});

test('association with chorus is not falsely upgraded to unconfounded causation',()=>{
 const original=runEditorialClaimPreflight(copy());
 assert.equal(original.evidence_preflight_ready,true);
 const f=copy();
 const item=f.claims.find(c=>c.claim_id==='c:chorus-associated');
 item.claim_type='causal';
 const result=runEditorialClaimPreflight(f);
 const checked=result.claim_reactor.claims.find(c=>c.claim_id==='c:chorus-associated');
 assert.equal(result.evidence_preflight_ready,false);
 assert.equal(checked.evidence_status,'association_only');
 assert.ok(checked.publication_blockers.includes('required_context_missing:confounders'));
 assert.ok(checked.publication_blockers.includes('required_context_missing:causal_evidence'));
 assert.equal(result.publication_authority,false);
});

test('refuses unknown source, forged approval, or missing photo provenance',()=>{
 const altered=copy();
 altered.evidence[0].source_refs=['source:invented'];
 assert.throws(()=>validateEditorialClaimInput(altered),/Unknown source reference/);
 const forged=copy();forged.editorial_gate={status:'accepted',score:10};
 assert.throws(()=>runEditorialClaimPreflight(forged),/may not claim publication authority/);
 const missing=copy();missing.evidence=missing.evidence.filter(x=>x.evidence_id!=='e:nasa-photo-provenance');
 assert.throws(()=>runEditorialClaimPreflight(missing),/Unknown claim evidence reference/);
});

test('the paper and institution sources are not mistaken for independent replications',()=>{
 assert.equal(input.sources.find(s=>s.source_id==='arase-peer-reviewed').primary,true);
 assert.ok(input.unresolved.some(x=>x.includes('No independent replication')));
 assert.ok(input.unresolved.some(x=>x.includes('5,000-fold')));
 assert.ok(input.unresolved.some(x=>x.includes('NASA')));
 assert.ok(input.unresolved.some(x=>x.includes('Systemia')));
});
