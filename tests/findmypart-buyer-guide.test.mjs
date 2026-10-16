import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync('public/field-guides/findmypart/index.html','utf8');
const catalog=JSON.parse(fs.readFileSync('registry/catalog.json','utf8'));
const direct=JSON.parse(fs.readFileSync('public/.well-known/evercraft-direct-doors.json','utf8'));
const info=(catalog.products||[]).find(p=>p.product_key==='findmypart');
const door=(direct.doors||[]).find(p=>p.product==='FindMyPart');

test('One-time FindMyPart offers are exact, priced and attributable',()=>{
 for(const [slug,price] of [['quick-hunt',19],['deep-hunt',49],['rescue-hunt',99]]){
  assert.ok(html.includes('$'+price+' <small>one-time</small>'),slug+' price must be transparent');
  assert.ok(html.includes('src=forge_fieldguide&amp;offer='+slug),slug+' direct buyer route must preserve source and offer');
 }
 assert.equal(info?.commercial_state,'sell_now');
 assert.match(info?.pricing||'',/Quick Hunt \$19 one-time; Deep Hunt \$49 one-time; Rescue Hunt \$99 one-time/);
 assert.doesNotMatch(html, /href="[^"]*shop-plan/i, 'Do not sell the inactive monthly offer');
});
test('Free check, partner kit and hunt destinations are the verified existing public routes',()=>{
 const links=[...html.matchAll(/href="(https:\/\/[^"]+)"/g)].map(m=>m[1].replaceAll('&amp;','&'));
 assert.equal(links.length,5,'exactly five outgoing product links');
 for(const url of links){
  const u=new URL(url);
  assert.equal(u.protocol,'https:');
  assert.equal(u.hostname,'findmypart.base44.app');
  assert.equal(u.searchParams.get('src'),'forge_fieldguide');
  assert.ok(['/free-part-check','/FindMyPart','/PartnerWithFindMyPart'].includes(u.pathname));
  if(u.pathname==='/FindMyPart')assert.ok(['quick-hunt','deep-hunt','rescue-hunt'].includes(u.searchParams.get('offer')));
 }
});
test('Guide cannot create leads, payments, tracking events, or hide its provider boundary',()=>{
 assert.doesNotMatch(html,/<(?:script|form|input)\b/i,'static public guide must never process information');
 assert.doesNotMatch(html,/stripe\.com|buy\.stripe\.com/,'provider checkout must begin within the canonical product intake');
 assert.match(html,/hosted on FindMyPart.s existing third-party-backed application/);
 assert.match(html,/Opening a checkout is not a payment receipt/);
 assert.match(html,/The recurring Shop Plan is not available for purchase/);
 assert.match(html,/separate approval/);
 assert.match(html,/Safety-critical substitutions require qualified review/);
});
test('Generated CHUM origin and owned-migration status remain gated and unmodified',()=>{
 assert.ok(door);
 assert.equal(door.public_origin_state,'legacy_provider_retired_owned_route_pending');
 assert.equal(door.free_entry.human_url,null);
 assert.equal(info?.canonical_url,'https://raw.githubusercontent.com/jgaethle10/forge-operator/main/public/chum/products/findmypart/index.html');
 assert.doesNotMatch(html, /Evercraft-owned infrastructure is live/i);
});
test('Accessible portable mobile guide avoids remote assets and respects reduced motion',()=>{
 assert.match(html,/<meta name="viewport" content="width=device-width, initial-scale=1">/);
 assert.match(html,/@media\(max-width:760px\)/);
 assert.match(html,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(html,/a:focus-visible/);
 assert.match(html,/<main id="top">/);
 assert.match(html,/<section id="hunts" aria-labelledby="hunts-title">/);
 assert.doesNotMatch(html,/<(?:img|iframe|link rel="stylesheet")\b/i);
});
