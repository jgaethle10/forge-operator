import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {INFLUENCE_SCHEMA} from './influence-lab.mjs';

const script=new URL('./render-concepts.mjs',import.meta.url);
const reference=new URL('../graphics-command/campaigns/website-audit-attention.json',import.meta.url);
const original=JSON.parse(fs.readFileSync(reference,'utf8'));
function input(){
  return {schema:INFLUENCE_SCHEMA,campaignId:'influence-cli-001',
    product:'Systemia Website Audit',offerKey:'website-audit',offerUrl:original.offerUrl,
    buyerProblem:'Improve navigational clarity',targetCommunity:'Independent service businesses',
    evidenceRefs:['https://example.org/creative-proof-source']};
}
test('local concept gallery builds twelve source-only SVG files without publication rights',()=>{
  const work=fs.mkdtempSync(path.join(os.tmpdir(),'influence-preview-'));
  try{
    const briefPath=path.join(work,'brief.json'),dir=path.join(work,'preview');
    fs.writeFileSync(briefPath,JSON.stringify(input()));
    const result=spawnSync(process.execPath,[script.pathname,'--brief',briefPath,'--reference',reference.pathname,'--out',dir],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    const output=JSON.parse(result.stdout);
    assert.equal(output.concepts,12);
    assert.equal(output.publicationAuthority,false);
    const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
    assert.equal(manifest.assets.length,12);
    assert.equal(manifest.sourceMediaVerified,false);
    assert.equal(manifest.paymentVerified,false);
    for(const item of manifest.assets){
      const svg=fs.readFileSync(path.join(dir,item.filename),'utf8');
      assert.match(svg,/EDITORIAL REVIEW ONLY/);
    }
    const gallery=fs.readFileSync(path.join(dir,'index.html'),'utf8');
    assert.match(gallery,/Unpublished concept studies/);
    assert.match(gallery,/designer-feed.svg/);
    assert.match(gallery,/human-feed.svg/);
    assert.match(gallery,/proof-feed.svg/);
  }finally{fs.rmSync(work,{recursive:true,force:true});}
});
test('CLI fails closed rather than replacing existing preview directory',()=>{
  const work=fs.mkdtempSync(path.join(os.tmpdir(),'influence-preview-'));
  try{
    const briefPath=path.join(work,'brief.json');
    fs.writeFileSync(briefPath,JSON.stringify(input()));
    const result=spawnSync(process.execPath,[script.pathname,'--brief',briefPath,'--reference',reference.pathname,'--out',work],{encoding:'utf8'});
    assert.equal(result.status,1);
    assert.match(result.stderr,/EEXIST/);
  }finally{fs.rmSync(work,{recursive:true,force:true});}
});
