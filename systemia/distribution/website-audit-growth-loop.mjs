#!/usr/bin/env node
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {buildCommercialResearchQueue} from '../commercial-intelligence/signal-to-demand.mjs';
import {planCommercialDecisions} from '../commercial-intelligence/commercial-decisions.mjs';

export const OFFER_URL='https://fabric.systemiacommandcenters.com/offers/website-audit';
export const CAMPAIGN_ID='website-audit-quick-win-20261007';
const priceCents=4900, stages=['publisher','web','checkout','payments','shipping'];
const treatments=[
  {id:'phone-test',day:1,asset:'poster-feed.svg',facebook:'Quick website test: open your business site on a phone. Can someone tell what you do, where you serve, and how to contact you without hunting? Start with that journey before buying more ads. Our $49 Quick Win Audit returns a public-web snapshot and five priority fixes.',linkedin:'Your homepage has one immediate job: help qualified visitors understand the offer and take the next step. Check your phone experience for clarity, trust and contact friction before increasing ad spend. Evercraft’s $49 Quick Win Audit offers a public-web snapshot and five prioritized fixes.'},
  {id:'before-rebuild',day:3,asset:null,facebook:'Before paying for a whole new website, check the basics. Is the headline clear? Is mobile navigation usable? Is the contact path obvious? Are trust signals easy to find? Are pages responsive? Our $49 Quick Win Audit turns that first look into five prioritized fixes.',linkedin:'A website rebuild is not always the first move. Start with five decision points: clarity, mobile usability, contact friction, trust and speed. A targeted audit can tell you where to investigate before approving a larger project. Our Quick Win Audit is $49, one time.'},
  {id:'fix-the-leak',day:5,asset:null,facebook:'More visitors will not automatically make a confusing website easier to use. Make the next step obvious, especially on mobile. Want an independent first look? Send us your site URL for a $49 Quick Win Audit and get five priority fixes.',linkedin:'Traffic is an input, not the outcome. If the website journey is unclear, adding traffic may amplify the same friction. We review the public experience and return five priority fixes for $49, without inventing conversion statistics or promising a particular result.'}
];
export function trackedLink(source,treatment){
  if(!['facebook','linkedin'].includes(source))throw new Error('unsupported_channel');
  if(!/^[a-z0-9-]+$/.test(treatment))throw new Error('invalid_treatment');
  const u=new URL(OFFER_URL);
  for(const [k,v] of Object.entries({utm_source:source,utm_medium:'organic_social',utm_campaign:CAMPAIGN_ID,utm_content:treatment}))u.searchParams.set(k,v);
  return u.toString();
}
export function buildWave(){
  const placements=treatments.flatMap(item=>['facebook','linkedin'].map(channel=>{
    const link=trackedLink(channel,item.id);
    return {
      id:CAMPAIGN_ID+'-'+item.id+'-'+channel, day:item.day,channel,content_id:item.id,
      creative_state:item.asset?'needs_live_edge_asset_check':'needs_reviewed_visual',
      asset:item.asset?'/visuals/website-audit-attention/'+item.asset:null,
      offer_url:link,caption:item[channel]+'\n\n'+link,
      state:'staged_not_published',publication_authority:false,publish_receipt:null
    };
  }));
  return {
    schema:'evercraft.distribution.website-audit-wave.v1',
    mission_key:'website-audit-first-closed-distribution-loop-2026-10-07',
    campaign_id:CAMPAIGN_ID,offer_url:OFFER_URL,price_cents:priceCents,
    route_through:'Systemia',systemia_admission:'required_unverified',
    transport:'Evercraft Clip',live_origin_verification:'unverified',
    live_checkout_verification:'unverified',publication_authority:false,placements,
    gates:['Live offer and visual assets pass public mobile inspection',
    'Checkout intent passes Evercraft Payments confirmation gate',
    'Each visual passes provenance, rights and publishing QA',
    'Every released placement gets a real Clip provider post receipt',
    'Edge visits, provider-settled orders and Shipping receipts are reconciled']
  };
}
// An evidence-summary contract, NOT an independently authenticated financial ledger.
// Upstream ingestion must reconcile and authenticate platform/payment/shipping receipts.
export function scorecard({events=[],coverage={}}={}){
  const eventStages={impression:'publisher',visit:'web',checkout_intent:'checkout',payment_settled:'payments',audit_delivered:'shipping'};
  const raw=Object.fromEntries(stages.map(s=>[s,0])),seen=new Set();
  const orderSets={payments:new Set(),shipping:new Set()},accepted=[],rejected=[];
  for(const e of events){
    const stage=eventStages[e?.type],id=String(e?.receipt_id||'').trim(),provider=String(e?.evidence_provider||'').trim();
    let why=!stage?'unknown_type':(!id||!provider?'missing_evidence_identity':null);
    const key=stage+':'+provider+':'+id;
    if(!why&&seen.has(key))why='duplicate_receipt';
    if(!why&&stage==='payments'&&!(provider==='Evercraft Payments'&&e.provider_verified===true&&e.settlement_verified===true&&e.order_id))why='unverified_payment';
    if(!why&&stage==='shipping'&&!(provider==='Systemia Shipping'&&e.delivery_verified===true&&e.order_id))why='unverified_delivery';
    if(!why&&orderSets[stage]?.has(String(e.order_id)))why='duplicate_order';
    const count=stage==='publisher'?Number(e.count):1;
    if(!why&&(!Number.isSafeInteger(count)||count<1))why='invalid_count';
    if(why){rejected.push({type:e?.type||null,receipt_id:id||null,reason:why});continue;}
    seen.add(key);
    orderSets[stage]?.add(String(e.order_id));
    raw[stage]+=count;
    accepted.push({type:e.type,receipt_id:id,evidence_provider:provider});
  }
  const counts=Object.fromEntries(stages.map(s=>[s,coverage[s]===true?raw[s]:null]));
  const rate=(n,d)=>Number.isInteger(n)&&Number.isInteger(d)&&d>0?Number((n/d).toFixed(4)):null;
  return {
    schema:'evercraft.distribution.website-audit-scorecard.v1',campaign_id:CAMPAIGN_ID,
    coverage:Object.fromEntries(stages.map(s=>[s,coverage[s]===true])),counts,
    visit_to_checkout_rate:rate(counts.checkout,counts.web),
    visit_to_payment_rate:rate(counts.payments,counts.web),
    paid_to_delivery_rate:rate(counts.shipping,counts.payments),
    submitted_settlement_value_usd:counts.payments===null?null:counts.payments*priceCents/100,
    receipts_accepted:accepted,receipts_rejected:rejected,
    warning:'Receipt assertions are not verified by this script; reconcile payment, refunds and deposits independently. Unknown feed coverage is null, never zero.',
    state:'not_closed_without_real_publication_visits_settlement_and_delivery'
  };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const i=process.argv.indexOf('--receipts');
  const input=i>=0?JSON.parse(fs.readFileSync(process.argv[i+1],'utf8')):{};
  const observationFlag=process.argv.indexOf('--observations');
  const observations=observationFlag>=0?JSON.parse(fs.readFileSync(process.argv[observationFlag+1],'utf8')):[];
  const commercial_research=buildCommercialResearchQueue(observations);
  const measured_scorecard=scorecard(input);
  process.stdout.write(JSON.stringify({
    wave:buildWave(),
    scorecard:measured_scorecard,
    commercial_research,
    commercial_decisions:planCommercialDecisions({researchQueue:commercial_research,scorecard:measured_scorecard})
  },null,2)+'\n');
}
