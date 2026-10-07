import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const candidates=JSON.parse(fs.readFileSync('registry/public-surface-candidates.json','utf8'));
const directory=JSON.parse(fs.readFileSync('public/.well-known/evercraft-products.json','utf8'));
const byKey=new Map((directory.products||[]).map((p)=>[p.product_key,p]));
const publicRequired=new Set(['demonstrable','commercial_ready','sell_now']);

test('demonstrable products have a truthful public surface',()=>{
  for(const candidate of candidates.candidates||[]){
    if(!publicRequired.has(candidate.surface_state))continue;
    const product=byKey.get(candidate.product_key);
    assert.ok(product,'Missing public product directory entry for '+candidate.product_key);
    assert.match(String(product.canonical_url||''),/^https:\/\//);
    assert.ok(Array.isArray(product.intents)&&product.intents.length>0,'Missing intents for '+candidate.product_key);
    assert.ok(Array.isArray(product.boundaries)&&product.boundaries.length>0,'Missing boundaries for '+candidate.product_key);

    if(candidate.commercial_state==='not_for_sale_yet'){
      assert.equal(product.commercial?.status,'not_for_sale_yet');
      assert.notEqual(product.commercial?.machine_commerce_handoff?.state,'live_verified');
      assert.ok(!product.buyer_frontage_url,'Not-for-sale product must not declare buyer frontage.');
      assert.ok(!product.human_start_url,'Unverified owned-host route must not be promoted as a human start URL.');
    }
  }
});

test('inventory existence alone still does not auto-publish',()=>{
  assert.match(String(candidates.policy),/Inventory alone never grants publication/);
});


function collectDemoHtml(root='public/demos'){
  if(!fs.existsSync(root)) return [];
  const out=[];
  for(const entry of fs.readdirSync(root,{withFileTypes:true})){
    const full=root+'/'+entry.name;
    if(entry.isDirectory()) out.push(...collectDemoHtml(full));
    else if(entry.isFile()&&entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

test('public demo surfaces are mobile-stable and must not horizontally wiggle',()=>{
  for(const file of collectDemoHtml()){
    const html=fs.readFileSync(file,'utf8');
    assert.match(html,/<meta\s+name=["']viewport["'][^>]*width=device-width/i,'Missing mobile viewport contract in '+file);
    assert.match(html,/overflow-x\s*:\s*(?:hidden|clip)/i,'Public demo must suppress document-level horizontal scrolling in '+file);
    assert.match(html,/max-width\s*:\s*100%/i,'Public demo must cap responsive content at the viewport in '+file);
    assert.match(html,/minmax\(0\s*,\s*1fr\)/i,'Public demo grids must allow children to shrink without forcing horizontal overflow in '+file);
  }
});
