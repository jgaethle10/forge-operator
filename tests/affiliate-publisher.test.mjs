import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {admitAffiliatePlacement} from '../systemia/affiliate-commerce/affiliate-placement-gate.mjs';

const p=new URL('../public/affiliate-labs/',import.meta.url);
const read=x=>fs.readFileSync(new URL(x,p),'utf8');
const programs=JSON.parse(fs.readFileSync(new URL('../systemia/affiliate-commerce/merchant-programs.json',import.meta.url),'utf8'));
const slugs=['pet-play','tool-rent-or-buy','auto-fitment'];
test('all three shopping microsites have original browser-side calculators and merchant honesty',()=>{
 const index=read('index.html');
 assert.ok(slugs.every(s=>index.includes('./'+s+'/')));
 for(const slug of slugs){
  const page=read(slug+'/index.html');
  assert.match(page,/<h1>/);
  assert.match(page,/id="run"/);
  assert.match(page,/id="result"/);
  assert.match(page,/<script>/);
  assert.match(page,/There are no commission-paying retailer links on this page/);
  assert.match(page,/original|Original/);
  assert.match(page,/<link rel="canonical" href="https:\/\/jgaethle10.github.io\/forge-operator\/affiliate-labs\//);
  assert.doesNotMatch(page,/(?:rivet|aliev|onlyfans|fansly|pornhub|nsfw|evercraft|mailto:)/i);
  assert.match(page,/content="noindex,follow"/);
  const script=page.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script?.length>200);
  assert.doesNotThrow(()=>new vm.Script(script,{filename:slug+'.js'}));
  assert.doesNotMatch(script,/\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon|document\.cookie/);
 }
});
test('registry preserves five non-adult and two separately gated adult candidates',()=>{
 assert.equal(programs.schema,'evercraft.affiliate-commerce.program-registry.v1');
 assert.equal(programs.public_safe_programs.length,5);
 assert.equal(programs.private_adult_programs.length,2);
 assert.equal(programs.audience_partition_policy.cross_promotion_forbidden,true);
 assert.equal(programs.audience_partition_policy.adult_launch_status,'not_launched_compliance_hold');
 assert.equal(programs.no_approved_tracking_links_on_file,true);
 assert.equal(programs.earned_commissions_verified_usd,null);
 assert.equal(programs.payouts_verified_usd,null);
 assert.equal(programs.public_safe_programs.find(x=>x.id==='home_depot').program_state,'declined_2026_08_24');
 for(const entry of [...programs.public_safe_programs,...programs.private_adult_programs]){
  assert.ok(entry.signup_url.startsWith('https://'));
  assert.equal(entry.tracking_link,null);
  assert.deepEqual(entry.approved_site_refs,[]);
  assert.notEqual(entry.program_state,'approved');
 }
});
test('merchant affiliation requires written approval and real tracked link',()=>{
 const known={id:'petco',niche:'pets',program_state:'not_applied_or_unverified',approved_site_refs:[]};
 assert.throws(()=>admitAffiliatePlacement({program:known,placementProperty:'https://example.org/'}),/affiliate_program_not_approved/);
 const approved={...known,program_state:'approved',approved_site_refs:['https://example.org/pets/']};
 const request={program:approved,placementProperty:'https://example.org/pets/',propertyNiche:'pets',trackingLink:'https://partner.example/approved-click',merchantApprovalReceipt:{approval_id:'mock-written-contract',status:'approved'},disclosure:'We may earn a commission if you purchase.',operatorApproved:true};
 assert.equal(admitAffiliatePlacement(request).rel,'sponsored noopener noreferrer');
 assert.throws(()=>admitAffiliatePlacement({...request,merchantApprovalReceipt:null}),/merchant_approval_receipt_missing/);
 assert.throws(()=>admitAffiliatePlacement({...request,disclosure:'Shop today'}),/commission_disclosure_required/);
 assert.throws(()=>admitAffiliatePlacement({...request,placementProperty:'https://example.org/elsewhere/'}),/property_not_registered/);
});
test('adult offer cannot use Evercraft host or bypass separate age and rights compliance',()=>{
 const prog={id:'adult_mock',niche:'adult_products',program_state:'approved',approved_site_refs:['https://independent.example/adults/','https://jgaethle10.github.io/forge-operator/']};
 const base={program:prog,placementProperty:'https://independent.example/adults/',propertyNiche:'adult_products',trackingLink:'https://approved.example/click',merchantApprovalReceipt:{approval_id:'mock',status:'approved'},operatorApproved:true,disclosure:'We may receive a commission.'};
 assert.throws(()=>admitAffiliatePlacement(base),/adult_separation_and_compliance_hold/);
 const preflight={status:'fully_verified',separate_brand:true,age_compliance_verified:true,rights_verified:true,host_and_processor_approved:true};
 assert.equal(admitAffiliatePlacement({...base,adultPreflight:preflight}).status,'authorized_placement_not_a_paid_receipt');
 assert.throws(()=>admitAffiliatePlacement({...base,placementProperty:'https://jgaethle10.github.io/forge-operator/',adultPreflight:preflight}),/adult_family_origin_blocked/);
});
