import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {buildCrawlPressure} from '../systemia/chum/crawl-accelerator.mjs';

const STUDIO='https://jgaethle10.github.io/forge-operator/commercial-studio/';
const RELATIVE='/forge-operator/commercial-studio/';

function makeTempSitemap(loc){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-studio-sitemap-'));
  fs.mkdirSync(path.join(root,'public'),{recursive:true});
  fs.mkdirSync(path.join(root,'public','evidence'),{recursive:true});
  fs.writeFileSync(path.join(root,'public','evidence','index.html'),'<h1>Source artifact</h1>\n');
  fs.writeFileSync(path.join(root,'public','sitemap.xml'),[
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    '  <url><loc>'+loc+'</loc></url>',
    '  <url><loc>/evidence/</loc></url>',
    '</urlset>',
    ''
  ].join('\n'));
  return root;
}

for(const initialLoc of [STUDIO,RELATIVE]){
  test('crawl-pressure retains exactly one Studio canonical URL even from '+(initialLoc===STUDIO?'absolute':'relative')+' input',async()=>{
    const root=makeTempSitemap(initialLoc);
    try{
      await buildCrawlPressure({root,now:'2026-11-09T20:00:00.000Z',origin:'',broadcast:false});
      const once=fs.readFileSync(path.join(root,'public','sitemap.xml'),'utf8');
      assert.equal(once.split('<loc>'+STUDIO+'</loc>').length-1,1);
      assert.equal(once.split('<loc>'+RELATIVE+'</loc>').length-1,0);
      assert.equal(once.split('<loc>/evidence/</loc>').length-1,1);
      assert.doesNotMatch(once,/<loc>https:\/\/evercraft\.invalid/);
      // Repeat scheduled refreshes: canonical URL must not degrade.
      await buildCrawlPressure({root,now:'2026-11-09T20:15:00.000Z',origin:'',broadcast:false});
      const twice=fs.readFileSync(path.join(root,'public','sitemap.xml'),'utf8');
      assert.equal(twice.split('<loc>'+STUDIO+'</loc>').length-1,1);
      assert.equal(twice.split('<loc>'+RELATIVE+'</loc>').length-1,0);
      assert.equal(twice.split('<loc>/evidence/</loc>').length-1,1);
      const state=JSON.parse(fs.readFileSync(path.join(root,'public','chum','crawl-state.json'),'utf8'));
      assert.equal(state.entries['/evidence/'].path,'/evidence/');
      assert.equal(Boolean(state.entries[RELATIVE]),false,'external landing must not be reported as locally byte-verified');
    }finally{fs.rmSync(root,{recursive:true,force:true})}
  });
}
