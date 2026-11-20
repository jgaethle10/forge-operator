import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNfipClaimsV3PageUrl,
  collectNfipStateLossHistory,
  NFIP_CLAIMS_V3_SOURCE
} from './nfip-claims-v3.mjs';

function claim(id,options={}){
  return {
    id:String(id),state:'WA',yearOfLoss:2024,
    amountPaidOnBuildingClaim:1000,
    amountPaidOnContentsClaim:100,
    amountPaidOnIncreasedCostOfComplianceClaim:0,
    ...options
  };
}
function fakeFeed(pages){
  const urls=[];
  const fetchImpl=async url=>{
    urls.push(url);
    const offset=Number(new URL(url).searchParams.get('$skip'));
    const pageSize=Number(new URL(url).searchParams.get('$top'));
    return {ok:true,text:async()=>JSON.stringify({NfipClaims:pages.slice(offset,offset+pageSize)})};
  };
  return {urls,fetchImpl};
}
const window={state:'WA',firstYear:2023,lastYear:2024,retrievedAt:'2026-11-20T00:00:00.000Z'};

test('only explicit state and bounded year range may be queried',()=>{
  const url=buildNfipClaimsV3PageUrl({...window,skip:1000});
  const u=new URL(url);
  assert.equal(u.origin,'https://www.fema.gov');
  assert.equal(u.pathname,'/api/open/v3/NfipClaims');
  assert.equal(u.searchParams.get('$filter'),"state eq 'WA' and yearOfLoss ge 2023 and yearOfLoss le 2024");
  assert.equal(u.searchParams.get('$top'),'1000');
  assert.equal(u.searchParams.get('$orderby'),'id asc');
  assert.equal(u.searchParams.get('$skip'),'1000');
  assert.equal(u.searchParams.get('$select').includes('reportedZipCode'),false);
  for(const invalid of [{state:"WA' or 1 eq 1"},{state:'wa'},{firstYear:1970},{lastYear:2050},{firstYear:2024,lastYear:2023},{pageSize:10001},{skip:-1}]){
    assert.throws(()=>buildNfipClaimsV3PageUrl({...window,...invalid}));
  }
  assert.equal(NFIP_CLAIMS_V3_SOURCE.evidence_state,'REPORTED');
});

test('aggregates only state-level loss payments, with no claim detail leakage',async()=>{
  const {fetchImpl,urls}=fakeFeed(Array.from({length:12},(_,i)=>claim(i+1)));
  const result=await collectNfipStateLossHistory({...window,fetchImpl,pageSize:5});
  assert.equal(result.status,'area_aggregate_available');
  assert.equal(result.claim_transactions,12);
  assert.equal(result.total_paid_usd,13200);
  assert.equal(result.building_paid_usd,12000);
  assert.equal(result.contents_paid_usd,1200);
  assert.equal(result.payment_completeness,'complete');
  assert.equal(result.known_payment_components_usd,13200);
  assert.equal(result.payment_coverage.records_with_missing_components,0);
  assert.equal(result.geography.level,'state');
  assert.equal(result.request_persisted,false);
  assert.equal(result.decision_authority,false);
  assert.equal(result.insurance_eligibility_decision,null);
  assert.equal(urls.length,3);
  const s=JSON.stringify(result);
  assert.equal(s.includes('amountPaidOnBuildingClaim'),false);
  assert.equal(s.includes('latitude'),false);
  assert.equal(s.includes('claim_ids'),false);
  assert.equal(s.includes('reportedZipCode'),false);
});

test('small cohorts suppress totals and amounts rather than disclosing individual-area losses',async()=>{
  const {fetchImpl}=fakeFeed(Array.from({length:10},(_,i)=>claim(i+1)));
  const result=await collectNfipStateLossHistory({...window,fetchImpl});
  assert.equal(result.status,'insufficient_area_records_suppressed');
  assert.equal(result.claim_transactions,null);
  assert.equal(result.total_paid_usd,null);
  assert.equal(result.building_paid_usd,null);
});

test('a missing FEMA payment value is unknown, not zero or a fabricated complete total',async()=>{
  const rows=Array.from({length:12},(_,i)=>claim(i+1));
  rows[0].amountPaidOnContentsClaim=null;
  rows[1].amountPaidOnBuildingClaim=undefined;
  rows[2].amountPaidOnIncreasedCostOfComplianceClaim='';
  const result=await collectNfipStateLossHistory({...window,fetchImpl:fakeFeed(rows).fetchImpl});
  assert.equal(result.status,'area_aggregate_available');
  assert.equal(result.payment_completeness,'partial');
  assert.equal(result.payment_coverage.complete_records,9);
  assert.equal(result.payment_coverage.records_with_missing_components,3);
  assert.equal(result.payment_coverage.building_present_records,11);
  assert.equal(result.payment_coverage.contents_present_records,11);
  assert.equal(result.payment_coverage.compliance_present_records,11);
  assert.equal(result.total_paid_usd,null);
  assert.equal(result.building_paid_usd,null);
  assert.equal(result.contents_paid_usd,null);
  assert.equal(result.compliance_paid_usd,null);
  assert.equal(result.known_payment_components_usd,12100);
  assert.equal(result.claim_transactions,12);
  assert.equal(result.request_persisted,false);
  assert.equal(result.insurance_eligibility_decision,null);
});

test('source error, row outside requested scope, malformed schema, and replay fail closed',async()=>{
  await assert.rejects(
    collectNfipStateLossHistory({...window,fetchImpl:async()=>({ok:false,status:503})}),
    /nfip_official_source_unavailable/
  );
  await assert.rejects(
    collectNfipStateLossHistory({...window,fetchImpl:fakeFeed([claim(1,{state:'OR'})]).fetchImpl}),
    /nfip_row_outside_requested_scope/
  );
  await assert.rejects(
    collectNfipStateLossHistory({...window,fetchImpl:async()=>({ok:true,text:async()=>JSON.stringify({NfipClaims:'not_rows'})})}),
    /nfip_v3_schema_unverified/
  );
  const repeated=async()=>({ok:true,text:async()=>JSON.stringify({NfipClaims:[claim(1)]})});
  await assert.rejects(
    collectNfipStateLossHistory({...window,fetchImpl:repeated,pageSize:1,maxPages:3}),
    /nfip_repeated_claim_between_pages/
  );
});
test('capped pages cannot claim complete coverage',async()=>{
  const {fetchImpl}=fakeFeed([claim(1),claim(2),claim(3),claim(4)]);
  await assert.rejects(
    collectNfipStateLossHistory({...window,fetchImpl,pageSize:2,maxPages:2}),
    /nfip_incomplete_pagination_no_public_result/
  );
});
