#!/usr/bin/env node
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parsePubmedEfetch } from './medical-abstract-evidence.mjs';
import {
 REGISTRY_API,normalizeClinicalTrialsStudy,crosscheckClinicalRegistrations,
 renderRegistryMarkdown,renderRegistryHTML,writeRegistryCrosscheck
} from './medical-registry-crosscheck.mjs';

const xml = '<PubmedArticleSet><PubmedArticle><MedlineCitation><PMID>12345</PMID>'+
 '<Article><ArticleTitle>Research title</ArticleTitle><Abstract>'+
 '<AbstractText Label="METHODS">The trial is registered as NCT00000001. Results not verified.</AbstractText>'+
 '</Abstract></Article><DataBankList><DataBank><DataBankName>ClinicalTrials.gov</DataBankName>'+
 '<AccessionNumberList><AccessionNumber>NCT00000001</AccessionNumber>'+
 '<AccessionNumber>NCT00000002</AccessionNumber></AccessionNumberList></DataBank>'+
 '<DataBank><DataBankName>GenBank</DataBankName><AccessionNumberList>'+
 '<AccessionNumber>NCT99999999</AccessionNumber></AccessionNumberList></DataBank>'+
 '</DataBankList></MedlineCitation></PubmedArticle></PubmedArticleSet>';
const parsed=parsePubmedEfetch(xml,['12345']).get('12345');
const abstracts={
 status:'abstracts_observed_unreviewed',receipt_hash:'sha256:pubmed-fixture',
 papers:[parsed,{...parsed,pmid:'67890',registry_ids:['NCT00000001']}]
};
const review={source_status:'source_quoted_unreviewed',receipt_hash:'sha256:review-fixture',
 input_receipts:{abstracts:abstracts.receipt_hash}};
const study=(id,hasResults=false)=>({
 protocolSection:{
  identificationModule:{nctId:id,briefTitle:'A registry & study'},
  statusModule:{overallStatus:'COMPLETED',lastUpdatePostDateStruct:{date:'2026-08-07'}},
  designModule:{studyType:'INTERVENTIONAL',phases:['PHASE2']},
  conditionsModule:{conditions:['Disease X']},
  sponsorCollaboratorsModule:{leadSponsor:{name:'Research Institute'}}
 },hasResults
});

test('extract NCT identifiers exclusively from PubMed abstract/registry DataBank',()=>{
 assert.deepEqual(parsed.registry_ids,['NCT00000001','NCT00000002']);
 assert.ok(!parsed.registry_ids.includes('NCT99999999'));
});

test('registry normalizer rejects an identity mismatch',()=>{
 assert.equal(normalizeClinicalTrialsStudy(study('NCT00000002'),'NCT00000001'),null);
 assert.equal(normalizeClinicalTrialsStudy(study('NCT00000001'),'NCT00000001').overall_status,'COMPLETED');
});

test('verifies only exact NCT IDs and never asserts efficacy from posted registry results',async()=>{
 const calls=[];
 const fetcher=async(u,opts)=>{
  calls.push(u);
  assert.ok(u.startsWith(REGISTRY_API));
  assert.ok(opts.signal);
  const id=u.slice(REGISTRY_API.length);
  return{ok:true,status:200,text:async()=>JSON.stringify(study(id,id==='NCT00000001'))};
 };
 const report=await crosscheckClinicalRegistrations({
  abstracts,review,fetcher,now:new Date('2026-11-10T22:00:00Z')
 });
 assert.equal(calls.length,2);
 assert.equal(report.registration_ids_observed,2);
 assert.equal(report.counts.confirmed_identifiers,2);
 assert.equal(report.counts.registry_results_posted,1);
 assert.equal(report.counts.verified_outcome_claims,0);
 assert.equal(report.editorial_disposition,'held_with_reason');
 assert.deepEqual(report.checks[0].source_pubmed_ids,['12345','67890']);
 assert.equal(report.checks[0].record.metadata_identity,'NCT_identifier_matches_registry_record');
 assert.equal(report.checks[0].paper_registry_linkage_review,'not_independently_confirmed');
 const html=renderRegistryHTML(report);
 assert.match(html,/A registry &amp; study/);
 assert.doesNotMatch(html,/A registry & study/);
 assert.match(renderRegistryMarkdown(report),/Confirmed medical outcomes:\*\* 0/);
});

test('registry outages, 404, mismatches and JSON errors are visible safe holds',async()=>{
 const bad=async(u)=> {
  const id=u.slice(REGISTRY_API.length);
  if(id==='NCT00000001')return{ok:false,status:404};
  return{ok:true,status:200,text:async()=>JSON.stringify(study('NCT90000000'))};
 };
 const report=await crosscheckClinicalRegistrations({abstracts,review,fetcher:bad});
 assert.equal(report.counts.confirmed_identifiers,0);
 assert.equal(report.counts.registry_not_found,1);
 assert.equal(report.counts.holds,1);
 assert.deepEqual(report.checks.map(x=>x.check_status),['registration_not_found','registry_identity_mismatch']);
 const broken=await crosscheckClinicalRegistrations({abstracts,review,
  fetcher:async()=>({ok:true,status:200,text:async()=>'{bad'})});
 assert.equal(broken.counts.holds,2);
 assert.equal(broken.counts.verified_outcome_claims,0);
});

test('invalid source receipts block all external lookups',async()=>{
 let count=0;
 const report=await crosscheckClinicalRegistrations({abstracts,
  review:{...review,input_receipts:{abstracts:'sha256:forged'}},
  fetcher:async()=>{count++;throw Error('must not run');}});
 assert.equal(report.source_status,'held_upstream_receipt_or_status');
 assert.equal(count,0);
 assert.equal(report.counts.lookup_attempts,0);
});

test('no explicit NCT results in no speculative trial registry matches',async()=>{
 const empty={...abstracts,papers:[{...parsed,registry_ids:[]}]};
 let count=0;
 const report=await crosscheckClinicalRegistrations({
  abstracts:empty,review:{...review,input_receipts:{abstracts:empty.receipt_hash}},
  fetcher:async()=>{count++;return{ok:false,status:503};}
 });
 assert.equal(count,0);
 assert.equal(report.registration_ids_observed,0);
 assert.equal(report.counts.verified_outcome_claims,0);
});

test('output artifacts are durable and contain receipt lineage',async()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-registry-'));
 try{
  const report=await writeRegistryCrosscheck({abstracts,review,outDir:out,
   fetcher:async(u)=>({ok:true,status:200,text:async()=>JSON.stringify(study(u.slice(REGISTRY_API.length)))}),
   now:new Date('2026-11-10T22:00:00Z')});
  for(const filename of ['latest.json','review.md','index.html'])assert.ok(fs.statSync(path.join(out,filename)).size>120);
  const stored=JSON.parse(fs.readFileSync(path.join(out,'latest.json'),'utf8'));
  assert.equal(stored.receipt_hash,report.receipt_hash);
 }finally{fs.rmSync(out,{recursive:true,force:true});}
});
