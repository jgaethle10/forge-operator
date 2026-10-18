import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  normalizeCommercialCampaign,
  compileCommercialAttention,
  assessCommercialScrollStop,
} from './commercial-director.mjs';
import {
  renderCommercialPoster,
  renderCommercialMotion,
  buildCommercialCampaign,
} from './commercial-renderer.mjs';

const campaign=JSON.parse(fs.readFileSync(
  new URL('./campaigns/website-audit-attention.json',import.meta.url),
  'utf8'
));

test('Website Audit campaign compiles as metaphor-first commercial creative',()=>{
  const normalized=normalizeCommercialCampaign(campaign);
  const plan=compileCommercialAttention(normalized);
  assert.equal(plan.schema,'evercraft.graphics-command.commercial-plan.v1');
  assert.equal(plan.treatment,'conversion_leak');
  assert.equal(plan.hero.visualPriority,'metaphor_first');
  assert.equal(plan.hero.maxTextCoverage,0.24);
  assert.equal(plan.formats.length,4);
  assert.equal(plan.motion.exactFrame,true);
  assert.equal(plan.truth.noFakeMetric,true);
  assert.equal(plan.publicationAuthority,false);
  assert.equal(plan.council.roles.length,10);
});

test('Website Audit campaign passes commercial scroll-stop gate',()=>{
  const report=assessCommercialScrollStop(compileCommercialAttention(campaign));
  assert.equal(report.status,'pass');
  assert.equal(report.score,1);
  assert.equal(report.evaluationScope,'plan_structure_only');
  assert.equal(report.creativeQualityState,'not_observed');
  assert.equal(report.cinematicApproval,false);
  assert.equal(report.checks.text_subordinate,true);
  assert.equal(report.checks.multi_format,true);
  assert.equal(report.checks.truth_guarded,true);
});

test('commercial poster makes the conversion leak the visual subject',()=>{
  const plan=compileCommercialAttention(campaign);
  const svg=renderCommercialPoster(campaign,plan,'feed');
  assert.match(svg,/width="1080" height="1350"/);
  assert.match(svg,/TRAFFIC UP\./);
  assert.match(svg,/CUSTOMERS/);
  assert.match(svg,/DOWN\?/);
  assert.match(svg,/QUICK WIN AUDIT/);
  assert.match(svg,/>\$49</);
  assert.match(svg,/CONVERT/);
  assert.match(svg,/SYNTHETIC VISUAL/);
  assert.doesNotMatch(svg,/health score.*[0-9]/i);
});

test('motion stage exposes deterministic Fallen render controls',()=>{
  const html=renderCommercialMotion(campaign,compileCommercialAttention(campaign));
  assert.match(html,/__evercraftRenderAt/);
  assert.match(html,/__evercraftRenderFrame/);
  assert.match(html,/Traffic up\./);
  assert.match(html,/Find the leak\./);
});

test('commercial builder emits complete campaign pack',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-commercial-'));
  const built=buildCommercialCampaign(campaign,{outputRoot:root});
  const dir=path.join(root,'website-audit-attention');
  for(const name of [
    'poster-feed.svg',
    'poster-square.svg',
    'poster-story.svg',
    'poster-hero-wide.svg',
    'motion.html',
    'manifest.json',
    'clip-handoff.json',
    'graphics-plan.json',
    'scroll-stop-report.json',
    'creative-council-inventory.json',
  ]){
    assert.equal(fs.existsSync(path.join(dir,name)),true,name);
  }
  assert.equal(built.manifest.assets.feed.endsWith('/poster-feed.svg'),true);
  assert.equal(built.manifest.offerUrl,'https://fabric.systemiacommandcenters.com/offers/website-audit');
  assert.equal(built.manifest.publicationAuthority,false);
});
