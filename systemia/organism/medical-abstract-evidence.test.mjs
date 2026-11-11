#!/usr/bin/env node
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
 PUBMED_EFETCH, parsePubmedEfetch, collectMedicalAbstractEvidence,
 writeMedicalAbstractEvidence, renderMedicalAbstractHTML, renderMedicalAbstractMarkdown
} from './medical-abstract-evidence.mjs';

const xml='<?xml version="1.0"?><PubmedArticleSet>'+
 '<PubmedArticle><MedlineCitation><PMID>12345</PMID><Article>'+
 '<ArticleTitle>Randomized cancer study &amp; outcomes</ArticleTitle>'+
 '<Abstract><AbstractText Label="BACKGROUND">Background description.</AbstractText>'+
 '<AbstractText Label="RESULTS">Reported <i>results</i> require verification &amp; appraisal.</AbstractText></Abstract>'+
 '<PublicationTypeList><PublicationType>Randomized Controlled Trial</PublicationType></PublicationTypeList>'+
 '</Article></MedlineCitation><PubmedData><ArticleIdList><ArticleId IdType="doi">10.1000/example.1</ArticleId></ArticleIdList>'+
 '</PubmedData></PubmedArticle>'+
 '<PubmedArticle><MedlineCitation><PMID>23456</PMID><Article>'+
 '<ArticleTitle>&lt;img src=x onerror=alert(1)&gt; abstract correction case</ArticleTitle>'+
 '<Abstract><AbstractText>This paper &lt;script&gt;not executed&lt;/script&gt; needs checking.</AbstractText></Abstract>'+
 '<PublicationTypeList><PublicationType>Journal Article</PublicationType></PublicationTypeList>'+
 '</Article><CommentsCorrectionsList><CommentsCorrections RefType="RetractionIn"><PMID>99999</PMID></CommentsCorrections></CommentsCorrectionsList>'+
 '</MedlineCitation></PubmedArticle></PubmedArticleSet>';
const watch={
 observed_at:'2026-11-05T20:00:00Z',receipt_hash:'sha256:original-watch',
 lanes:{medical_research:{
  status:'observed',total_recent_matches:400,
  documents:[{pmid:'12345'},{pmid:'23456'},{pmid:'23456'},{pmid:'invalid'}]
 }}
};

test('extracts original abstracts, DOI and study-design hints without hallucinated conclusions',()=>{
 const parsed=parsePubmedEfetch(xml,['12345','23456','99999']);
 assert.equal(parsed.size,2);
 assert.equal(parsed.get('12345').doi,'10.1000/example.1');
 assert.equal(parsed.get('12345').study_design_hint,'controlled_trial_type');
 assert.equal(parsed.get('12345').abstract_sections.length,2);
 assert.match(parsed.get('12345').abstract_sections[1].text,/results require verification/);
 assert.equal(parsed.get('23456').needs_correction_review,true);
 assert.equal(parsed.get('23456').correction_signals[0],'RetractionIn');
});

test('bounded EFetch reading queue with metadata-only review hold and escaped standalone HTML',async()=>{
 let requests=0;
 const fetcher=async(url,options)=>{
  requests++;
  assert.ok(String(url).startsWith(PUBMED_EFETCH));
  assert.equal(new URL(url).searchParams.get('id'),'12345,23456');
  assert.ok(options.signal);
  return{ok:true,text:async()=>xml};
 };
 const report=await collectMedicalAbstractEvidence({watch,fetcher,now:new Date('2026-11-05T20:01:00Z')});
 assert.equal(requests,1);
 assert.equal(report.status,'abstracts_observed_unreviewed');
 assert.equal(report.sampled_records,2);
 assert.equal(report.abstracts_retrieved,2);
 assert.deepEqual(report.correction_review_queue,['23456']);
 assert.equal(report.publication_disposition,'held_with_reason');
 const html=renderMedicalAbstractHTML(report);
 assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
 assert.doesNotMatch(html,/<img src=x onerror=alert\(1\)>/);
 assert.match(renderMedicalAbstractMarkdown(report),/Clinical findings independently verified:\*\* 0/);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-abstract-test-'));
 try{
  const output=await writeMedicalAbstractEvidence({watch,fetcher,outDir:dir,now:new Date('2026-11-05T20:01:00Z')});
  assert.equal(output.receipt_hash,report.receipt_hash);
  for(const file of ['latest.json','index.html','abstract-review.md']){
   assert.ok(fs.statSync(path.join(dir,file)).size>150,file);
  }
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('fails closed when upstream metadata is held or EFetch fails',async()=>{
 const never=()=>{throw Error('fetch should never run')};
 const upstream=await collectMedicalAbstractEvidence({
  watch:{lanes:{medical_research:{status:'held',reason:'503'}}},fetcher:never});
 assert.equal(upstream.status,'held_source_unavailable');
 assert.equal(upstream.sampled_records,0);
 const down=await collectMedicalAbstractEvidence({watch,fetcher:async()=>({ok:false,status:503})});
 assert.equal(down.status,'held_source_unavailable');
 assert.match(down.publication_hold,/503/);
 assert.equal(down.abstracts_retrieved,0);
});

test('missing abstracts stay visible, and unreturned records are not silently replaced with invented text',async()=>{
 const onlyOne=xml.replace(/<PubmedArticle><MedlineCitation><PMID>23456<\/PMID>[\s\S]*?<\/PubmedArticle>/,'');
 const r=await collectMedicalAbstractEvidence({watch,fetcher:async()=>({ok:true,text:async()=>onlyOne})});
 assert.equal(r.status,'partial_abstract_coverage');
 assert.equal(r.abstracts_retrieved,1);
 assert.equal(r.missing_abstracts,1);
 assert.equal(r.papers[1].abstract_status,'missing_or_unindexed');
 assert.match(renderMedicalAbstractHTML(r),/Abstract unavailable/);
});
