import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('./homecoming-preview.html',import.meta.url),'utf8');
const catalog=JSON.parse(fs.readFileSync(new URL('./yakima-community-records.v1.json',import.meta.url),'utf8'));
test('source-linked seed catalog is bounded, unique and not publication authority',()=>{
 assert.equal(catalog.schema,'evercraft.home.community-records.v1');
 assert.equal(catalog.publication_authorized,false);assert.equal(catalog.media_copied,false);assert.equal(catalog.personal_matches,false);
 assert.equal(catalog.records.length,7);assert.equal(new Set(catalog.records.map(r=>r.id)).size,7);
 for(const r of catalog.records){
  assert.match(r.id,/^[a-z0-9-]+$/);assert.ok(Number.isInteger(r.year)&&r.year>=1800&&r.year<=2026);
  assert.equal(r.place,'Yakima');assert.ok(['photograph_record','historical_moment'].includes(r.type));
  assert.ok(['link_only','no_known_restrictions_reported'].includes(r.rights));
  assert.ok(r.source&&r.credit);assert.ok(['www.loc.gov','goyaks.com','www.milb.com','www.statefairpark.org'].includes(new URL(r.url).hostname));
  const article=html.match(new RegExp('<article[^>]+data-record="'+r.id+'"[^>]*>[\\s\\S]*?</article>'))?.[0];
  assert.ok(article);assert.ok(article.includes('data-year="'+r.year+'"'));assert.ok(article.includes('href="'+r.url+'"'));
 }
});
test('era and category filters work together and retain undated archive doorways',()=>{
 const cards=[...html.matchAll(/<article class="card" data-kind="([^"]+)"(?: data-year="(\d+)")?/g)].map(m=>({dataset:{kind:m[1],year:m[2]},hidden:false}));
 const make=(type,values)=>values.map(v=>({dataset:{[type]:v},handler:null,addEventListener(_,fn){this.handler=fn},setAttribute(k,v){this[k]=v}}));
 const buttons=make('filter',['all','places','schools','traditions']),eras=make('era',['all','pre1980','1980-1999','2000-2009','2010plus']);
 const count={textContent:''};
 const document={querySelectorAll:q=>q==='[data-filter]'?buttons:q==='[data-era]'?eras:cards,getElementById:()=>count};
 vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],{document});
 assert.equal(cards.length,12);
 eras[3].handler();assert.equal(cards.filter(c=>!c.hidden&&c.dataset.year).length,2);
 buttons[2].handler();assert.equal(cards.filter(c=>!c.hidden&&c.dataset.year).length,1);assert.equal(count.textContent,'4 discoveries');
 assert.equal(eras[3]['aria-pressed'],'true');assert.equal(buttons[2]['aria-pressed'],'true');
 eras[0].handler();buttons[0].handler();assert.equal(cards.filter(c=>!c.hidden).length,12);
});
