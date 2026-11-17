import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const load=(p)=>fs.readFileSync(path.join(ROOT,p),'utf8');
const page=load('public/systemia/index.html');
const head=load('public/headquarters/index.html');
const tryHub=load('public/try/index.html');
const workflow=load('.github/workflows/evercraft-journal-pages.yml');
const svg=load('public/systemia/social-card.svg');

test('Systemia new front door offers real bounded proof and honest limits',()=>{
  assert.match(page,/<h1[^>]*id="page-title"/);
  assert.match(page,/work-saban\/report\/\?utm_source=systemia_front_door/);
  assert.match(page,/mesh\/ai-boardroom\/compare\//);
  assert.match(page,/\.\.\/research\//);
  assert.match(page,/end-to-end autonomous customer workflow is already publicly available/i);
  assert.match(page,/No pretend live agents/i);
  assert.doesNotMatch(page,/Systemia has already (earned|collected|automated)/i);
});

test('buyer handoff asks for an approved scope before payment',()=>{
  assert.match(page,/commercial-studio\/\?utm_source=systemia_front_door/);
  assert.match(page,/before accepting payment/);
  assert.match(page,/Project intake first/);
  assert.match(page,/mailto:jessegaethle10@gmail.com/);
  assert.match(page,/Nothing uploads or sends automatically/i);
  assert.doesNotMatch(page,/<form[^>]*action=["']https?:/i);
});

test('real company entry and free tools both route into Systemia',()=>{
  assert.match(head,/See Systemia in action/);
  assert.match(head,/forge-operator\/systemia\//);
  assert.match(tryHub,/Meet Systemia/);
  assert.match(tryHub,/\.\.\/systemia\//);
});

test('share image is generated as a proper image, not an SVG-only claim',()=>{
  assert.match(page,/og:image" content="https:\/\/jgaethle10.github.io\/forge-operator\/systemia\/social-card.png"/);
  assert.match(svg,/viewBox="0 0 1200 630"/);
  assert.match(svg,/MEET SYSTEMIA|SYSTEMIA/);
  assert.match(workflow,/_public_pages\/systemia\/social-card.svg/);
  assert.match(workflow,/write_to="_public_pages\/systemia\/social-card.png"/);
  assert.match(workflow,/SYSTEMIA_SOCIAL_PNG_VERIFIED/);
});

test('referenced bounded local paths are real',()=>{
  for(const p of ['public/work-saban/report/index.html','public/work-saban/demo/index.html','public/mesh/ai-boardroom/compare/index.html','public/research/index.html','public/commercial-studio/index.html','public/headquarters/mark.svg']){
    assert.ok(fs.statSync(path.join(ROOT,p)).isFile(),p);
  }
});
