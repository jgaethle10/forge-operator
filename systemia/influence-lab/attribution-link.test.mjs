import test from 'node:test';
import assert from 'node:assert/strict';
import {makeInfluenceAttributionLink,reconcileTaggedVisit} from './attribution-link.mjs';

const base=()=>({offerUrl:'https://fabric.systemiacommandcenters.com/offers/website-audit',
  campaignId:'influence-website-audit-001',assetId:'designer-feed-001',channel:'linkedin'});
test('link preserves precise channel and content without creating a sale',()=>{
 const l=makeInfluenceAttributionLink(base()),u=new URL(l.url);
 assert.equal(u.searchParams.get('utm_source'),'linkedin');
 assert.equal(u.searchParams.get('utm_medium'),'owned_content');
 assert.equal(u.searchParams.get('utm_campaign'),'influence-website-audit-001');
 assert.equal(u.searchParams.get('utm_content'),'designer-feed-001');
 assert.equal(l.visitObserved,false);
 assert.equal(l.settlementVerified,false);
 assert.equal(l.publishingAuthorized,false);
});
test('disclosed creator link is only a tag, not proof of disclosure or attribution',()=>{
 const l=makeInfluenceAttributionLink({...base(),partnerCode:'creator-001',channel:'youtube'});
 assert.equal(new URL(l.url).searchParams.get('ref'),'creator-001');
 assert.equal(new URL(l.url).searchParams.get('utm_medium'),'disclosed_creator');
 assert.equal(l.creatorRelationshipDisclosureVerified,false);
 assert.equal(l.incrementalityVerified,false);
});
test('rejects untrusted origin, checkout secret-bearing urls and nonoffer paths',()=>{
 assert.throws(()=>makeInfluenceAttributionLink({...base(),offerUrl:'https://fraud.example/offers/website-audit'}),/untrusted_destination/);
 assert.throws(()=>makeInfluenceAttributionLink({...base(),offerUrl:'https://fabric.systemiacommandcenters.com/checkout/session'}),/untrusted_destination/);
 assert.throws(()=>makeInfluenceAttributionLink({...base(),offerUrl:'https://fabric.systemiacommandcenters.com/offers/website-audit?session_id=secret'}),/sensitive_query_denied/);
 assert.throws(()=>makeInfluenceAttributionLink({...base(),offerUrl:'https://fabric.systemiacommandcenters.com/offers/website-audit#checkout'}),/untrusted_destination/);
});
test('rejects personal identifiers and unsupported platforms in tags',()=>{
 assert.throws(()=>makeInfluenceAttributionLink({...base(),assetId:'name@example.com'}),/asset_id_invalid/);
 assert.throws(()=>makeInfluenceAttributionLink({...base(),campaignId:'Call me at 555-1234'}),/campaign_id_invalid/);
 assert.throws(()=>makeInfluenceAttributionLink({...base(),channel:'telegram'}),/channel_invalid/);
 assert.throws(()=>makeInfluenceAttributionLink({...base(),partnerCode:'John Smith'}),/partner_code_invalid/);
});
test('recorded visits remain unverified and cannot be attributed across campaigns',()=>{
 const l=makeInfluenceAttributionLink(base());
 assert.throws(()=>reconcileTaggedVisit({link:l,visit:{campaignId:'other',assetId:l.assetId,channel:l.channel,partnerCode:null,eventId:'event001',sourceRef:'x'}}),/provenance_mismatch/);
 const report=reconcileTaggedVisit({link:l,visit:{campaignId:l.campaignId,assetId:l.assetId,channel:l.channel,partnerCode:null,eventId:'event001',sourceRef:'local-log-file'}});
 assert.equal(report.state,'unverified_source_observation');
 assert.equal(report.humanVisitorConfirmed,false);
 assert.equal(report.incrementalRevenueVerified,false);
});
