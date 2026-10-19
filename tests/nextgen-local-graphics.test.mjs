import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {hashFiles,gatePreview} from '../scripts/nextgen-local-graphics.mjs';

test('fingerprints change when local source content changes',()=>{
  const d=fs.mkdtempSync(path.join(os.tmpdir(),'nextgen-fingerprint-'));
  try{
    fs.mkdirSync(path.join(d,'code'));
    fs.writeFileSync(path.join(d,'code/a.mjs'),'export const a=1;\n');
    const first=hashFiles(d,['code']);
    assert.equal(first.file_count,1);
    assert.equal(first.digest,hashFiles(d,['code']).digest);
    fs.writeFileSync(path.join(d,'code/a.mjs'),'export const a=2;\n');
    assert.notEqual(hashFiles(d,['code']).digest,first.digest);
  }finally{fs.rmSync(d,{recursive:true,force:true});}
});

test('source fingerprint refuses symlinks',()=>{
  const d=fs.mkdtempSync(path.join(os.tmpdir(),'nextgen-link-'));
  try{
    fs.symlinkSync('/etc/passwd',path.join(d,'outside'));
    assert.throws(()=>hashFiles(d,['outside']),/source_symlink_rejected/);
  }finally{fs.rmSync(d,{recursive:true,force:true});}
});

test('quality gate requires an actual built file set, scores and publication denied',()=>{
  const d=fs.mkdtempSync(path.join(os.tmpdir(),'nextgen-gate-'));
  try{
    const put=(name,body)=>fs.writeFileSync(path.join(d,name),JSON.stringify(body));
    put('poster-quality-report.json',{status:'pass',publicationAuthority:false,formats:{feed:{status:'pass'},square:{status:'pass'},story:{status:'pass'}}});
    put('scroll-stop-report.json',{status:'pass',publicationAuthority:false});
    put('shot-tournament.json',{publicationAuthority:false,winnerId:'terrain-hero',candidates:[{id:'terrain-hero'},{id:'relief'}]});
    put('manifest.json',{storyDigest:'sha256-fixture'});
    put('clip-handoff.json',{publicationAuthority:false});
    put('graphics-plan.json',{publicationAuthority:false});
    for(const name of ['poster-feed.svg','poster-square.svg','poster-story.svg','motion.html','index.html'])fs.writeFileSync(path.join(d,name),'local');
    assert.equal(gatePreview(d).pass,true);
    put('clip-handoff.json',{publicationAuthority:true});
    assert.equal(gatePreview(d).pass,false);
    put('clip-handoff.json',{publicationAuthority:false});
    fs.rmSync(path.join(d,'poster-story.svg'));
    assert.equal(gatePreview(d).pass,false);
  }finally{fs.rmSync(d,{recursive:true,force:true});}
});
