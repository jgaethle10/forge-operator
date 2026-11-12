#!/usr/bin/env node
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
 registeredTrialSearchUrl,eligibleSearchIds,discoverRegisteredTrialLiterature,
 buildRegisteredTrialReview,runRegisteredTrialLane
} from './medical-registered-trial-lane.mjs';
import {REGISTRY_API} from './medical-registry-crosscheck.mjs';

const xml='<PubmedArticleSet>'+
 '<PubmedArticle><MedlineCitation><PMID>10001</PMID><Article>'+
 '<ArticleTitle>Placebo-controlled trial on a hypothetical intervention</ArticleTitle>'+
 '<Abstract><AbstractText Label="BACKGROUND">Study rationale.</AbstractText>'+
 '<AbstractText Label="RESULTS">The authors reported findings; no independent appraisal yet.</AbstractText></Abstract>'+
 '<PublicationTypeList><PublicationType>Randomized Controlled Trial</PublicationType></PublicationTypeList>'+
 '</Article><DataBankList><DataBank><DataBankName>ClinicalTrials.gov</DataBankName>'+
 '<AccessionNumberList><AccessionNumber>NCT00000001</AccessionNumber></AccessionNumberList>'+
 '</DataBank></DataBankList></MedlineCitation></PubmedArticle>'+
 '<PubmedArticle><MedlineCitation><PMID>10002</PMID><Article>'+
 '<ArticleTitle>No NCT on source record</ArticleTitle>'+
 '<Abstract><AbstractText>Research abstract with no explicit registry ID</AbstractText></Abstract>'+
 '</Article></MedlineCitation></PubmedArticle></PubmedArticleSet>';
const registry=(id)=>({
 protocolSection:{
  identificationModule:{nctId:id,briefTitle:'Registered public study'},
  statusModule:{overallStatus:'COMPLETED'},
  designModule:{studyType:'INTERVENTIONAL',phases:['PHASE1']}
 },hasResults:true
});
const fakeFetcher=async(url,options)=>{
 assert.ok(options.signal);
 const u=new URL(url);
 if(u.pathname.endsWith('/esearch.fcgi')) {
  assert.equal(u.searchParams.get('term'),'clinicaltrials.gov[si]');
  return {ok:true,text:async()=>JSON.stringify({esearchresult:{count:'2',idlist:['10001','10002']}})};
 }
 if(u.pathname.endsWith('/efetch.fcgi')) {
  assert.equal(u.searchParams.get('id'),'10001,10002');
  return {ok:true,text:async()=>xml};
 }
 if(url===REGISTRY_API+'NCT00000001')return{
  ok:true,status:200,text:async()=>JSON.stringify(registry('NCT00000001'))
 };
 throw Error('unexpected mocked origin '+url);
};

test('uses NLM documented Secondary Source ID search and bounded inputs',()=>{
 const u=new URL(registeredTrialSearchUrl({days:800,retmax:900}));
 assert.equal(u.searchParams.get('term'),'clinicaltrials.gov[si]');
 assert.equal(u.searchParams.get('reldate'),'365');
 assert.equal(u.searchParams.get('retmax'),'40');
 assert.equal(u.searchParams.get('datetype'),'edat');
 assert.deepEqual(eligibleSearchIds({esearchresult:{count:'50',idlist:['123','123','bad','234']}}),{
  total:50,ids:['123','234']
 });
 assert.equal(eligibleSearchIds({esearchresult:{idlist:['123']}}),null);
});

test('discovers only PubMed-verified NCT candidates and produces real matching registry receipts',async()=>{
 const at=new Date('2026-11-11T23:00:00Z');
 const r=await discoverRegisteredTrialLiterature({fetcher:fakeFetcher,now:at});
 assert.equal(r.source_status,'source_indexed_unreviewed');
 assert.equal(r.pubmed_search_total,2);
 assert.equal(r.explicitly_registered_papers,1);
 assert.deepEqual(r.papers[0].registry_ids,['NCT00000001']);
 const {source,review}=buildRegisteredTrialReview(r,{now:at});
 assert.equal(source.originating_discovery_receipt,r.receipt_hash);
 assert.equal(review.counts.candidate_records,1);
 assert.equal(review.counts.approved_for_publication,0);
 assert.equal(review.evidence_matrix[0].independently_confirmed,false);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-nct-lane-'));
 try{
  const output=await runRegisteredTrialLane({fetcher:fakeFetcher,now:at,outDir:dir});
  assert.equal(output.official_nct_ids_confirmed,1);
  assert.equal(output.independently_verified_outcomes,0);
  assert.equal(output.publication_disposition,'held_with_reason');
  const checks=JSON.parse(fs.readFileSync(path.join(dir,'registry.json'),'utf8'));
  assert.equal(checks.counts.confirmed_identifiers,1);
  assert.equal(checks.checks[0].record.registry_results_posted,true);
  assert.equal(checks.counts.verified_outcome_claims,0);
  for(const file of ['latest.json','review.json','registry.json','review.md','registry.md','index.html'])
   assert.ok(fs.statSync(path.join(dir,file)).size>150,file);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('source search failure fails closed; registry is never queried',async()=>{
 let fetched=0;
 const r=await runRegisteredTrialLane({
  fetcher:async(url)=>{fetched++;return{ok:false,status:503};},
  outDir:fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-nct-hold-'))
 });
 assert.equal(fetched,1);
 assert.equal(r.discovery.source_status,'held_source_unavailable');
 assert.equal(r.official_nct_ids_confirmed,0);
 assert.equal(r.independently_verified_outcomes,0);
 assert.equal(r.publication_disposition,'held_with_reason');
});

test('invalid ESearch structure and unavailable EFetch never fabricate registered papers',async()=>{
 const invalid=await discoverRegisteredTrialLiterature({fetcher:async()=>({
  ok:true,text:async()=>JSON.stringify({esearchresult:{idlist:['10001']}})
 })});
 assert.equal(invalid.source_hold,'pubmed_esearch_invalid_response');
 const down=await discoverRegisteredTrialLiterature({fetcher:async(url)=>{
  if(url.includes('esearch.fcgi'))return{
   ok:true,text:async()=>JSON.stringify({esearchresult:{count:'1',idlist:['10001']}})
  };
  return {ok:false,status:504};
 }});
 assert.equal(down.source_status,'held_source_unavailable');
 assert.equal(down.explicitly_registered_papers,0);
});

test('valid search with no explicit NCT metadata does not trigger speculative registry lookup',async()=>{
 let registryCalls=0;
 const fetcher=async(url,opts)=>{
  if(url.includes('esearch.fcgi'))return{ok:true,text:async()=>JSON.stringify({esearchresult:{count:'1',idlist:['10002']}})};
  if(url.includes('efetch.fcgi'))return{ok:true,text:async()=>xml};
  if(url.startsWith(REGISTRY_API)){registryCalls++;throw Error('No invented trial lookups');}
  throw Error('Unexpected origin');
 };
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-nct-nohit-'));
 try{
  const output=await runRegisteredTrialLane({fetcher,outDir:dir});
  assert.equal(output.discovery.explicitly_registered_papers,0);
  assert.equal(output.official_nct_ids_confirmed,0);
  assert.equal(registryCalls,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
