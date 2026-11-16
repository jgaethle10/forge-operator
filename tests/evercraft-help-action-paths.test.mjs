import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {loadPublicProductDiscovery} from '../systemia/mcp/fabric-public-products.mjs';
import {loadFabricCatalogFromRepository,executeFabricDirectoryRpc} from '../systemia/mcp/fabric-directory.mjs';

const ROOT=path.resolve(import.meta.dirname,'..');
const html=fs.readFileSync(path.join(ROOT,'public/help/index.html'),'utf8');
const source=loadPublicProductDiscovery();
const byId=id=>source.find(item=>item.public_id===id);

test('Evercraft help is an honest mobile-first decision door for four real-life needs',()=>{
  for(const anchor of ['id="work"','id="home"','id="community"','id="everyday"','id="how-this-works"']){
    assert.ok(html.includes(anchor),'missing '+anchor);
  }
  assert.match(html,/<meta name="viewport"/);
  assert.match(html,/<main/);
  assert.match(html,/<nav class="quick" aria-label=/);
  assert.match(html,/No automatic enrollment, payment, job placement or service booking/);
  assert.match(html,/not an Evercraft vacancy/);
  assert.match(html,/not promise active nearby deals/);
  assert.match(html,/do not ask for personal, health, employment or payment details/);
  assert.doesNotMatch(html,/<form[\s>]|<input[\s>]|fetch\(|XMLHttpRequest|mailto:/i);
  // Havenly belongs to its own operator. Never enroll it through Evercraft.
  assert.doesNotMatch(html,/havenly|nikki/i);
});

test('each owned path links to a real file in this checkout',()=>{
  const localHrefs=[...html.matchAll(/href="(\/forge-operator\/[^"]*)"/g)].map(x=>x[1]);
  assert.ok(localHrefs.length>=13);
  for(const url of localHrefs){
    assert.ok(!url.includes('..'),'unsafe traversal');
    const remaining=url.slice('/forge-operator/'.length);
    const file=path.join(ROOT,'public',remaining,'index.html');
    assert.ok(fs.existsSync(file),'broken public owned path: '+url);
  }
});

test('official external employment resource links and EPS origin use HTTPS',()=>{
  assert.match(html,/href="https:\/\/www\.worksourcewa\.com\/"/);
  assert.match(html,/href="https:\/\/esd\.wa\.gov\/jobs-and-training\/find-job\/job-seekers-get-help-worksource"/);
  assert.match(html,/href="\/forge-operator\/eps\/"/);
  assert.doesNotMatch(html,/base44\.app/i);
});

test('Fabric public products choose truthful action pages without commercial authority',()=>{
  const front=byId('product:evercraft-front-door');
  const eps=byId('product:evercraft-property-services');
  const partner=byId('product:evercraft-partners');
  assert.equal(front.connections[0].url,'https://jgaethle10.github.io/forge-operator/help/');
  assert.equal(eps.connections[0].url,'https://jgaethle10.github.io/forge-operator/eps/');
  assert.equal(partner.connections[0].url,'https://jgaethle10.github.io/forge-operator/partners/');
  for(const product of [front,eps,partner]){
    assert.equal(product.commercial_state,'discovery_only');
    assert.equal(product.entry_paid_offer,null);
    assert.equal(product.start_url_state,'not_sell_now');
    assert.equal(product.connections[0].state,'source_discovery_not_live_service_verified');
  }
});

test('Fabric MCP exposes the link and remains strictly read-only',async()=>{
  const catalog=loadFabricCatalogFromRepository();
  for(const [public_id,expected_url] of [
    ['product:evercraft-front-door','https://jgaethle10.github.io/forge-operator/help/'],
    ['product:evercraft-property-services','https://jgaethle10.github.io/forge-operator/eps/'],
  ]){
    const rpc=await executeFabricDirectoryRpc({
      jsonrpc:'2.0',id:15,method:'tools/call',params:{
        name:'get_evercraft_connection_options',arguments:{public_id},
      },
    },catalog);
    const out=rpc.result?.structuredContent;
    assert.equal(out.public_id,public_id);
    assert.ok(out.connections.some(x=>x.type==='website'&&x.url===expected_url));
    assert.equal(out.external_action_taken,false);
    assert.equal(out.transactional,false);
    assert.equal(out.buyer_checkout_available,false);
    assert.equal(out.human_offer_url,null);
  }
});
