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
import { commercialPosterLayout, assessCommercialComposition } from './commercial-layout-qa.mjs';

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

test('wide campaign headline is complete and clears the browser illustration',()=>{
  const layout=commercialPosterLayout(campaign,'hero-wide');
  assert.equal(layout.hookLines.length,3);
  assert.equal(layout.hookLines.join(' '),campaign.creative.hook);
  const report=assessCommercialComposition(campaign,'hero-wide');
  assert.equal(report.status,'pass',JSON.stringify(report.issues));
  assert.equal(report.checks.text_clear_of_browser,true);
  for(const format of ['feed','square','story','hero-wide']){
    const result=assessCommercialComposition(campaign,format);
    assert.equal(result.status,'pass',format+':'+result.issues.join(','));
  }
});

test('oversized commercial headline rejects rather than silently truncating',()=>{
  const tooLong=structuredClone(campaign);
  tooLong.creative.hook='A HEADLINE THAT CANNOT FIT INTO THE ALLOWED SPATIAL COMPOSITION WITHOUT LOSING ITS CORE WORDS';
  const report=assessCommercialComposition(tooLong,'hero-wide');
  assert.equal(report.status,'reject');
  assert.ok(report.issues.includes('headline_truncated'));
});

test('commercial build emits geometry QA and refuses to imply finished cinematic delivery',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-commercial-layout-'));
  try{
    const built=buildCommercialCampaign(campaign,{outputRoot:root,origin:'https://preview.invalid/visuals'});
    assert.ok(Object.values(built.composition).every(x=>x.status==='pass'));
    const outputDir=path.join(root,campaign.slug);
    const report=JSON.parse(fs.readFileSync(path.join(outputDir,'composition-report.json'),'utf8'));
    assert.equal(report.status,'pass');
    assert.equal(built.manifest.deliveryState,'previsualization_only');
    assert.equal(built.manifest.filmProductionStatus,'not_rendered');
    assert.equal(built.manifest.verifiedShotMediaCount,0);
    assert.equal(built.manifest.humanVisualApproval,false);
    assert.equal(built.manifest.publicationAuthority,false);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
