import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';

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

    const productRoot=path.join('public','chum','products',candidate.product_key);
    for(const filename of ['index.html','llms.txt','ai-discovery.json','ai-conformance.json']){
      const surface=path.join(productRoot,filename);
      assert.ok(fs.existsSync(surface),'Missing materialized public surface '+surface);
      assert.ok(fs.statSync(surface).size>0,'Empty materialized public surface '+surface);
    }

    const discovery=JSON.parse(fs.readFileSync(path.join(productRoot,'ai-discovery.json'),'utf8'));
    assert.equal(discovery.product_key,candidate.product_key,'Discovery product key drift for '+candidate.product_key);
    assert.equal(discovery.name,product.name,'Discovery product name drift for '+candidate.product_key);
    assert.ok(Array.isArray(discovery.intents)&&discovery.intents.length>0,'Discovery intents missing for '+candidate.product_key);

    const blockedHosts=['base44.app'];
    for(const value of [product.canonical_url,product.human_start_url,candidate.owned_url_target]){
      if(!value)continue;
      const url=new URL(String(value));
      assert.equal(url.protocol,'https:','Public product URL must use HTTPS for '+candidate.product_key);
      assert.ok(!blockedHosts.some((host)=>url.hostname===host||url.hostname.endsWith('.'+host)),'Retired provider URL leaked into public surface for '+candidate.product_key);
    }

    assert.ok(Array.isArray(candidate.evidence)&&candidate.evidence.length>0,'Demonstrable candidate needs evidence for '+candidate.product_key);
    assert.ok(candidate.activation_gate,'Demonstrable candidate needs an activation gate for '+candidate.product_key);

    if(candidate.activation_gate!=='live_verified'){
      assert.ok(!product.human_start_url,'Unverified owned-host route must not be promoted as a human start URL.');
    }

    if(candidate.commercial_state==='not_for_sale_yet'){
      assert.equal(product.commercial?.status,'not_for_sale_yet');
      assert.notEqual(product.commercial?.machine_commerce_handoff?.state,'live_verified');
      assert.ok(!product.buyer_frontage_url,'Not-for-sale product must not declare buyer frontage.');
      assert.ok(!product.human_start_url,'Unverified owned-host route must not be promoted as a human start URL.');
    }

    if(candidate.surface_state==='sell_now'){
      assert.equal(product.commercial?.status,'sell_now','Sell-now candidate must declare sell_now commercial state.');
      assert.equal(product.commercial?.machine_commerce_handoff?.state,'live_verified','Sell-now candidate requires live-verified machine commerce handoff.');
    }
  }
});

test('inventory existence alone still does not auto-publish',()=>{
  assert.match(String(candidates.policy),/Inventory alone never grants publication/);
});


test('candidate states stay inside the governed public-surface state machine',()=>{
  const allowedStates=new Set(['internal','demonstrable','commercial_ready','sell_now']);
  const allowedCommercial=new Set(['internal','not_for_sale_yet','commercial_ready','sell_now']);
  const keys=new Set();
  for(const candidate of candidates.candidates||[]){
    assert.ok(candidate.product_key,'Candidate product key is required.');
    assert.ok(!keys.has(candidate.product_key),'Duplicate public-surface candidate '+candidate.product_key);
    keys.add(candidate.product_key);
    assert.ok(allowedStates.has(candidate.surface_state),'Unknown surface state '+candidate.surface_state);
    assert.ok(allowedCommercial.has(candidate.commercial_state),'Unknown commercial state '+candidate.commercial_state);
    if(candidate.surface_state==='internal'){
      assert.ok(!candidate.owned_url_target,'Internal-only candidate must not advertise an owned public URL target.');
    }
  }
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
    assert.match(html,/-webkit-text-size-adjust\s*:\s*100%/i,'Public demo must stabilize iOS text sizing in '+file);
    assert.match(html,/font-size\s*:\s*16px/i,'Public demo form controls must avoid iOS focus zoom in '+file);
    assert.match(html,/min-height\s*:\s*44px/i,'Public demo interactive controls must provide touch-sized targets in '+file);
  }
});


test('public demo inline scripts parse cleanly and documents are not structurally duplicated',()=>{
  for(const file of collectDemoHtml()){
    const html=fs.readFileSync(file,'utf8');
    const closingHtml=(html.match(/<\/html>/gi)||[]).length;
    assert.equal(closingHtml,1,'Public demo must contain exactly one closing html tag in '+file);
    const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
    for(const match of scripts){
      const attributes=match[0].slice(0,match[0].indexOf('>')+1);
      if(/\bsrc\s*=/.test(attributes)||!match[1].trim()) continue;
      if(/\btype\s*=\s*["']application\/(?:ld\+json|json)["']/i.test(attributes)){
        assert.doesNotThrow(()=>JSON.parse(match[1]),'Inline JSON syntax failed in '+file);
        continue;
      }
      if(/\btype\s*=\s*["']module["']/i.test(attributes)){
        // new Function cannot parse legitimate ES-module imports/exports.
        // Node syntax checking validates module source without executing it.
        const check=spawnSync(process.execPath,['--input-type=module','--check'],{
          input:match[1],encoding:'utf8',timeout:10000,maxBuffer:1024*1024
        });
        assert.equal(check.status,0,'Inline module syntax failed in '+file+': '+String(check.stderr||check.error||''));
        continue;
      }
      assert.doesNotThrow(()=>new Function(match[1]),'Inline classic script syntax failed in '+file);
    }
  }
});
