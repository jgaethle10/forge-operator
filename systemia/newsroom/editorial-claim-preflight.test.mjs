import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {runEditorialClaimPreflight,validateEditorialClaimInput} from './editorial-claim-preflight.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const fixture=JSON.parse(fs.readFileSync(path.join(here,'editorial-queue/2026-11-05-chainsaw-claim-input.json'),'utf8'));
const clone=()=>structuredClone(fixture);

test('chainsaw source packet gets a real Claim Reactor preflight, never a release',()=>{
 const packet=runEditorialClaimPreflight(clone());
 assert.equal(packet.story_id,'journal:2026-11-02:chainsaw-surgical-origins');
 assert.equal(packet.source_count,5);
 assert.equal(packet.evidence_count,6);
 assert.equal(packet.claim_count,6);
 assert.equal(packet.evidence_preflight_ready,true);
 assert.deepEqual(packet.publication_blockers,[]);
 assert.ok(packet.claim_reactor.claims.every(c=>c.evidence_status==='supported_by_cited_evidence'));
 assert.ok(packet.claim_reactor.claims.every(c=>c.ready_for_editorial_use));
 assert.equal(packet.claim_reactor.publication_authority,false);
 assert.equal(packet.publication_authority,false);
 assert.equal(packet.public_article_status,'not_published');
 assert.equal(packet.editorial_gate.status,'not_accepted');
 assert.equal(packet.journal_publication_receipt,null);
 assert.equal(packet.systemia_publication_release,null);
 assert.equal(packet.clip_provider_receipts.length,0);
 assert.ok(packet.next_gates.includes('independent_editorial_10_of_10'));
 assert.ok(packet.next_gates.includes('systemia_signed_publication_release'));
 assert.ok(packet.unresolved.some(s=>s.includes('routine live childbirth')));
});

test('unknown source evidence and claim refs are refused instead of silently disappearing',()=>{
 const missingSource=clone();
 missingSource.evidence[0].source_refs=['s:not-a-source'];
 assert.throws(()=>validateEditorialClaimInput(missingSource),/Unknown source reference/);
 const missingEvidence=clone();
 missingEvidence.claims[0].supporting_evidence_refs=['e:not-an-evidence'];
 assert.throws(()=>validateEditorialClaimInput(missingEvidence),/Unknown claim evidence reference/);
});

test('false approval / release fields cannot sneak into the input',()=>{
 for(const [field,value] of [['status','approved'],['editorial_gate',{status:'accepted',score:10}],['publication_authority',true],['systemia_release',{signature:'test'}],['production_grade',{status:'accepted'}]]){
  const f=clone();
  f[field]=value;
  assert.throws(()=>runEditorialClaimPreflight(f),/may not claim publication authority/);
 }
});

test('unsupported causal inference is blocked by the Claim Reactor',()=>{
 const f=clone();
 f.claims=[{
  claim_id:'c:fake-causation',
  claim:'The chainsaw caused improved birth survival.',
  claim_type:'causal',
  supporting_evidence_refs:['e:aitken-context']
 }];
 const result=runEditorialClaimPreflight(f);
 assert.equal(result.evidence_preflight_ready,false);
 const claim=result.claim_reactor.claims[0];
 assert.equal(claim.evidence_status,'association_only');
 assert.ok(claim.publication_blockers.includes('required_context_missing:confounders'));
 assert.ok(claim.publication_blockers.includes('required_context_missing:causal_evidence'));
 assert.equal(result.publication_authority,false);
});

test('preflight source manifest explicitly distinguishes late medical tool from earlier obstetric device',()=>{
 const f=clone();
 const photo=f.claims.find(c=>c.claim_id==='c:photo');
 assert.ok(photo);
 assert.ok(f.evidence.find(e=>e.evidence_id==='e:photo-rights')?.summary.includes('not Aitken'));
 assert.ok(f.unresolved.some(x=>x.includes('forestry')));
});
