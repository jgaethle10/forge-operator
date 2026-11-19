import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const parse=path=>JSON.parse(read(path));
const root='public/mesh/checkout-ready/social-media-weekly/';
const station=read(root+'brand-review/decision/index.html');
const comparison=read(root+'brand-review/index.html');
const contract=read('docs/branding/approvals/BR-001-review-station-v2.md');
const ledger=parse('docs/branding/approvals/ledger.json');
const history=parse('docs/branding/approvals/events.json');
const original=parse('public/mesh/checkout-ready/verified-links.json');
const product=parse(root+'product.json');
const brand=parse(root+'brand.json');

test('first founder review remains unapproved and must preserve the exact $100 SKU',()=>{
 assert.equal(ledger.founder_reviews_approved,0);
 assert.equal(ledger.current_review_order,1);
 assert.equal(ledger.products.length,7);
 assert.equal(ledger.products[0].decision.approved,false);
 assert.equal(ledger.products[0].decision.status,'changes_requested');
 assert.equal(ledger.products.slice(1).every(x=>x.decision.status==='not_reviewed'),true);
 assert.equal(ledger.products[0].exploration.review_station.version,'BR-001.R2');
 assert.equal(ledger.products[0].exploration.review_station.automatically_records_approval,false);
 assert.equal(ledger.products[0].exploration.review_station.founder_decision_received,false);
 assert.equal(product.identity.founder_approved,false);
 assert.equal(brand.governance.founder_approved,false);
 assert.equal(product.price_usd,100);
 assert.equal(product.checkout.url,original.links.find(x=>x.key==='weekly-social').url);
 assert.equal(product.checkout.reconciliation,'manual_unverified_automated_sync');
 assert.equal(history.founder_decision_events,1);
 assert.ok(history.entries.some(x=>x.event_id==='BR-001-E005'&&x.founder_decision===false));
 assert.ok(history.entries.some(x=>x.event_id==='BR-001-E006'&&x.founder_decision===true));
 assert.ok(station.includes('ARCHIVED REJECTED SHORTLIST'));
});

test('review station is non-submitting, mobile-aware, and keeps a documented local draft',()=>{
 assert.match(station,/<meta name="robots" content="noindex,nofollow,noarchive">/);
 assert.match(station,/<meta name="viewport" content="width=device-width,initial-scale=1">/);
 assert.match(station,/FOUND[ER]* REVIEW WORKSPACE|FOUNDER REVIEW WORKSPACE/);
 assert.match(station,/NOT APPROVED|0 of 7 approved/);
 assert.match(station,/class="wrap"/);
 assert.match(station,/name="candidate" value="Weekkin"/);
 assert.match(station,/name="candidate" value="Cadencekeep"/);
 assert.match(station,/name="candidate" value="Weekmorrow"/);
 assert.equal((station.match(/class="candidate"/g)||[]).length,3);
 assert.equal((station.match(/data-dimension=/g)||[]).length,8);
 assert.equal((station.match(/<input type="radio" name="disposition"/g)||[]).length,5);
 for(const term of ['continue_exploration','revise','hold','reject_shortlist','request_approval_review'])assert.ok(station.includes('value="'+term+'"'));
 for(const term of ['LOCAL_UNSUBMITTED_DRAFT_NOT_APPROVAL','founder_approved:false','submitted_to_evercraft:false','legally_cleared:false','review_packet:version','candidate_feedback:','dimension_feedback:','other_feedback:'])
  assert.ok(station.includes(term),term+' required');
 assert.ok(station.includes('navigator.clipboard.writeText'));
 assert.ok(station.includes('new Blob'));
 assert.ok(station.includes('new Date().toISOString()'));
 assert.ok(station.includes('Nothing was submitted or approved'));
 assert.ok(station.includes('This page is accessible to anyone who has its link'));
 assert.ok(!station.includes('buy.stripe.com'));
 assert.ok(!station.includes('http-equiv="refresh"'));
 assert.ok(!/<script\s+src=/.test(station));
 assert.ok(!/<form[^>]+action=/.test(station));
 assert.ok(!/\bfetch\s*\(/.test(station),'no network calls allowed');
 assert.ok(!/XMLHttpRequest|sendBeacon|localStorage|sessionStorage/.test(station),'no remote calls or persistent storage');
 assert.ok(station.includes('@media(max-width:760px)'));
 assert.ok(station.includes('@media(prefers-reduced-motion:reduce)'));
 assert.ok(comparison.includes('href="./decision/"'));
 assert.ok(contract.includes('founder_approved:false'));
 const scripts=[...station.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]);
 assert.equal(scripts.length,1,'only one source-controlled inline JS block');
 assert.doesNotThrow(()=>new Script(scripts[0],{filename:'BR-001-decision-station.js'}));
});

test('first review naming research remains versioned and no candidate is auto-selected',()=>{
 const research=parse('docs/branding/approvals/BR-001-name-exploration-v1.json');
 assert.deepEqual(research.candidates.map(x=>x.name),['Weekkin','Cadencekeep','Weekmorrow']);
 assert.equal(research.explicit_founder_approval,false);
 assert.equal(research.approved_candidate,null);
 assert.equal(ledger.products[0].exploration.founder_selected_candidate,null);
 assert.equal((comparison.match(/class="concept variant-/g)||[]).length,3);
 assert.ok(!station.includes('type="submit"'));
});
