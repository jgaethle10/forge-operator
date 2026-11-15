#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  buildMedicalEvidenceBrief, renderMedicalEvidenceSVG,
  renderMedicalEvidenceHTML, renderMedicalEvidenceMarkdown, writeMedicalEvidenceBrief
} from './medical-evidence-brief.mjs';

const watch = {
  observed_at: '2026-11-05T16:00:00.000Z',
  receipt_hash: 'sha256:source-evidence-receipt',
  lanes: { medical_research: {
    status: 'observed',
    source: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi',
    query_scope: 'PubMed research titles indexed in last two days',
    total_recent_matches: 213,
    documents: [
      { pmid: '12345', title: 'Parkinson disease biomarkers', source: 'Journal One', pubdate: '2026', authors: [{name:'Alice'}] },
      { pmid: '23456', title: 'Cancer genetics evidence', source: 'Journal Two', pubdate: '2026', authors: [] },
      { pmid: '23456', title: 'Duplicate metadata record', source: 'Journal Two', pubdate: '2026' },
      { pmid: 'not-a-pmid', title: 'Unverified bad identifier', source: 'Unknown', pubdate: '2026' },
      { pmid: '34567', title: '<img src=x onerror=alert(1)> public health', source: '<script>evil</script>', pubdate: '2026' },
    ]
  }}
};

test('creates source-linked, escaped, explicit metadata-only artifacts', () => {
  const result = buildMedicalEvidenceBrief(watch, {now:new Date('2026-11-05T16:01:00Z')});
  assert.equal(result.status, 'metadata_observed');
  assert.equal(result.sampled_titles, 3);
  assert.equal(result.total_recent_matches, 213);
  assert.equal(result.sampled_title_topics['Parkinson and neurology'], 1);
  assert.equal(result.sampled_title_topics.Oncology, 1);
  assert.equal(result.sampled_title_topics['Public and planetary health'], 1);
  assert.equal(result.publication_disposition, 'held_with_reason');
  assert.equal(result.documents[0].source_url, 'https://pubmed.ncbi.nlm.nih.gov/12345/');
  const svg = renderMedicalEvidenceSVG(result);
  const html = renderMedicalEvidenceHTML(result, svg);
  const markdown = renderMedicalEvidenceMarkdown(result);
  assert.match(svg, /THE RESEARCH RADAR/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<script>evil<\/script>/);
  assert.match(markdown, /article-level review/i);
  assert.match(markdown, /JOURNAL/i);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-medical-radar-'));
  const output = writeMedicalEvidenceBrief({watch, outDir:tmp, now:new Date('2026-11-05T16:01:00Z')});
  assert.equal(output.receipt_hash, result.receipt_hash);
  for (const file of ['latest.json','report.md','research-radar.svg','index.html']) {
    assert.ok(fs.statSync(path.join(tmp,file)).size > 100, file);
  }
  fs.rmSync(tmp,{recursive:true,force:true});
});

test('holds publication and suppresses counts when PubMed source is unavailable', () => {
  const bad = {...watch, lanes:{medical_research:{status:'held', reason:'http_503'}}};
  const result=buildMedicalEvidenceBrief(bad);
  assert.equal(result.status,'source_held');
  assert.equal(result.total_recent_matches, null);
  assert.equal(result.sampled_titles,0);
  assert.equal(result.publication_disposition,'held_with_reason');
  assert.match(result.publication_hold,/unavailable/);
  assert.doesNotMatch(renderMedicalEvidenceHTML(result,renderMedicalEvidenceSVG(result)), /<a href="https:\/\/pubmed/);
});

test('does not treat a partial PubMed summary as independently verified research', () => {
  const partial={...watch,lanes:{medical_research:{...watch.lanes.medical_research,status:'observed_with_summary_hold'}}};
  const result=buildMedicalEvidenceBrief(partial);
  assert.equal(result.status,'source_held');
  assert.equal(result.sampled_titles,0);
  assert.equal(result.publication_disposition,'held_with_reason');
});
