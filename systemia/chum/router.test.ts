import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveChumIntent} from './router.ts';

const directory={routing_rule:'smallest capability first',products:[
  {product_key:'forensiscope',name:'ForensiScope',class:'ai_media_overflow_and_analysis',canonical_url:'https://example.test/forensiscope',intents:['this video is too large for my AI to process','analyze hours of video or audio'],overflow_signals:['file_size_exceeded','duration_exceeded'],authority:'public discovery',human_confirmation_required:true,boundaries:['user submits media']},
  {product_key:'findmypart',name:'FindMyPart',class:'hard_to_source_parts',canonical_url:'https://example.test/findmypart',intents:['find a discontinued tractor part','find an obsolete machine part'],authority:'public discovery',human_confirmation_required:true,boundaries:['compatibility not guaranteed']}
]};
const catalog={universal_front_door:{registry_name:'io.github.jgaethle10/evercraft-machine-commerce',mcp:'https://example.test/mcp'},products:[
  {registry_name:'io.github.jgaethle10/forensiscope',mcp:'https://example.test/forensiscope-mcp',triggers:['video too large for AI','media upload limit']},
  {registry_name:'io.github.jgaethle10/findmypart',mcp:'https://example.test/findmypart-mcp',triggers:['hard-to-find part','obsolete part']}
],payment_boundary:{human_confirmation_required_for_checkout:true}};

test('routes media overflow to ForensiScope first',()=>{const out=resolveChumIntent(directory,catalog,'My video is too large for AI to process');assert.equal(out.match,true);assert.equal(out.routes[0].product_key,'forensiscope');});
test('routes obsolete parts to FindMyPart first',()=>{const out=resolveChumIntent(directory,catalog,'I need to find an obsolete tractor part');assert.equal(out.routes[0].product_key,'findmypart');});
test('empty query fails closed',()=>{const out=resolveChumIntent(directory,catalog,'   ');assert.equal(out.match,false);assert.deepEqual(out.routes,[]);});
test('unknown query does not fabricate',()=>{const out=resolveChumIntent(directory,catalog,'quantum submarine violin licensing');assert.equal(out.match,false);assert.deepEqual(out.routes,[]);});
test('preserves universal front door',()=>{const out=resolveChumIntent(directory,catalog,'hard-to-find part');assert.equal(out.universal_front_door.registry_name,'io.github.jgaethle10/evercraft-machine-commerce');});
test('returns payment-ready 99c ROASTED offer',()=>{
  const d={routing_rule:'smallest',products:[{product_key:'roasted',name:'ROASTED',canonical_url:'https://example.test/roasted',intents:['roast my bio','pressure test this copy'],authority:'public paid critique',human_confirmation_required:true,boundaries:['payment confirmation required']}]};
  const offers={schema:'evercraft.public-offers.v1',updated_at:'2026-09-24',offers:[{product_key:'roasted',public_id:'roasted-text-pressure-test-machine-v1',name:'ROASTED 99¢ Text Pressure Test',commercial_state:'sell_now',machine_state:'payment_ready',pricing:'$0.99 USD one-time per roast.',offers:[{name:'Single Roast',price:'$0.99',billing:'one_time'}],confirmation:'Explicit confirmation required.',public_url:'https://example.test/roasted/docs'}]};
  const out=resolveChumIntent(d,catalog,'roast my bio',5,offers);
  assert.equal(out.routes[0].product_key,'roasted');assert.equal(out.routes[0].commercial.machine_state,'payment_ready');assert.equal(out.routes[0].commercial.offers[0].price,'$0.99');
});
