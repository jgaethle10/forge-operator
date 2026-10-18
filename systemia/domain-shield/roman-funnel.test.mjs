import test from 'node:test';
import assert from 'node:assert/strict';
import { ROMAN_ROUTES, resolveRomanContinuity, validRomanHtml } from './roman-funnel.mjs';

const goodHtml='<!doctype html><html><h1>Roman Kilinkaridis</h1><a href="https://donate.voteroman.com/">Donations</a></html>';
const valid=()=>new Response(goodHtml,{status:200,headers:{'content-type':'text/html; charset=utf-8'}});

test('local original bytes always win without any remote fetch or visitor tracking',async()=>{
 let calls=0;
 const outcome=await resolveRomanContinuity({localHtml:goodHtml,fetchImpl:async()=>{calls++;throw Error('unexpected outbound');}});
 assert.deepEqual(outcome,{state:'local_ready',status:302,location:'/campaigns/roman/'});
 assert.equal(calls,0);
});
test('backup used only when local content absent and known remote is externally verified',async()=>{
 const routes=[];
 const outcome=await resolveRomanContinuity({
   localHtml:'',
   fetchImpl:async(url,opts)=>{
     routes.push([url,opts.method,opts.redirect]);
     return valid();
   },
 });
 assert.deepEqual(outcome,{state:'independent_backup_ready',status:302,location:ROMAN_ROUTES.backup});
 assert.deepEqual(routes,[[ROMAN_ROUTES.backup,'GET','error']]);
});
test('original failing status, redirect, bad content type, missing marker and downtime fail closed',async()=>{
 const scenarios=[
  new Response('[APP UNAVAILABLE]',{status:402,headers:{'content-type':'text/html'}}),
  new Response('',{status:302,headers:{location:'https://untrusted.example/'}}),
  new Response(goodHtml,{status:200,headers:{'content-type':'application/json'}}),
  new Response('<html>Unauthorized information</html>',{status:200,headers:{'content-type':'text/html'}}),
  new Response(' '.repeat(1024*1024+1),{status:200,headers:{'content-type':'text/html'}}),
 ];
 for(const response of scenarios){
   const result=await resolveRomanContinuity({localHtml:'',fetchImpl:async()=>response});
   assert.equal(result.status,503);
   assert.equal(result.location,null);
 }
 const offline=await resolveRomanContinuity({localHtml:'',fetchImpl:async()=>{throw Error('network off')}});
 assert.equal(offline.status,503);
});
test('strict informational validation preserves original donation URL and rejects outage page',()=>{
 assert.equal(validRomanHtml(goodHtml),true);
 assert.equal(validRomanHtml(goodHtml.replace('donate.voteroman.com/','fake.example/')),false);
 assert.equal(validRomanHtml(goodHtml+'[APP UNAVAILABLE]'),false);
 assert.equal(validRomanHtml(null),false);
});
