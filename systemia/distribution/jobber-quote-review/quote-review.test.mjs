import test from "node:test";
import assert from "node:assert/strict";
import {reviewQuotes,unpackQuotePage,READ_ONLY_QUOTES_QUERY} from "./quote-review.mjs";
const now=new Date("2026-10-15T19:00:00Z");
const base={accountId:"synthetic-account",now,allPagesFetched:true,eligibleStatuses:["AWAITING_RESPONSE"]};
const q=(id,sentAt,quoteStatus="AWAITING_RESPONSE")=>({id,sentAt,quoteStatus,client:{name:"PRIVATE FIXTURE"},amount:1400});
test("seven-day-old synthetic quote is review-only without leaking client data",()=>{
  const a=reviewQuotes({...base,quotes:[q("Q1","2026-10-08T19:00:00Z")]});
  assert.equal(a.reviewCount,1);assert.equal(a.findings[0].elapsedDays,7);
  assert.equal(a.findings[0].action,"human_review_only");
  assert.ok(!JSON.stringify(a).includes("PRIVATE FIXTURE"));
  assert.ok(!JSON.stringify(a).includes("1400"));
});
test("incomplete snapshot fails closed",()=>assert.throws(()=>reviewQuotes({...base,allPagesFetched:false,quotes:[]}),/Incomplete snapshot/));
test("no assumed status allowlist",()=>assert.throws(()=>reviewQuotes({...base,eligibleStatuses:undefined,quotes:[]}),/eligibleStatuses/));
test("terminal status is never treated as eligible",()=>{
  const a=reviewQuotes({...base,quotes:[q("Q2","2026-10-01T00:00:00Z","ACCEPTED")]});
  assert.equal(a.reviewCount,0);assert.equal(a.ignored.otherStatus,1);
});
test("unsent, future, and recent quotes are ignored",()=>{
  const a=reviewQuotes({...base,quotes:[q("a",null),q("b","2026-10-16T00:00:00Z"),q("c","2026-10-15T00:00:00Z")]});
  assert.equal(a.reviewCount,0);
  assert.deepEqual([a.ignored.unsent,a.ignored.futureTimestamp,a.ignored.tooRecent],[1,1,1]);
});
test("deduplicates by stable provider quote ID",()=>{
  const a=reviewQuotes({...base,quotes:[q("same","2026-09-01T00:00:00Z"),q("same","2026-08-01T00:00:00Z")]});
  assert.equal(a.reviewCount,1);assert.equal(a.ignored.duplicate,1);
  assert.equal(a.findings[0].tenantRef,"synthetic-account");
});
test("rejects malformed inputs",()=>{
  assert.throws(()=>reviewQuotes({...base,accountId:"",quotes:[]}),/accountId/);
  assert.throws(()=>reviewQuotes({...base,now:new Date("bad"),quotes:[]}),/Date/);
  assert.throws(()=>reviewQuotes({...base,staleAfterDays:0,quotes:[]}),/staleAfterDays/);
});
test("GraphQL example is query only and paginated",()=>{
  assert.match(READ_ONLY_QUOTES_QUERY,/query EvercraftQuoteReview/);
  assert.match(READ_ONLY_QUOTES_QUERY,/hasNextPage/);
  assert.doesNotMatch(READ_ONLY_QUOTES_QUERY,/\bmutation\b/i);
});
test("GraphQL errors and absent page metadata fail closed",()=>{
  assert.throws(()=>unpackQuotePage({errors:[{message:"rate limited"}],data:{quotes:{edges:[]}}}),/GraphQL errors/);
  assert.throws(()=>unpackQuotePage({data:{quotes:{edges:[]}}}),/pageInfo/);
});
test("valid GraphQL page is unpacked for later pagination",()=>{
  const a=unpackQuotePage({data:{quotes:{edges:[{node:q("Q1","2026-10-01T00:00:00Z")}],pageInfo:{hasNextPage:false,endCursor:null}}}});
  assert.equal(a.quotes.length,1);assert.equal(a.hasNextPage,false);
});
test("malformed records are not misclassified",()=>{
  const a=reviewQuotes({...base,quotes:[{},null,q("ok","2026-10-01T00:00:00Z")]});
  assert.equal(a.ignored.invalidRecord,2);assert.equal(a.reviewCount,1);
});
