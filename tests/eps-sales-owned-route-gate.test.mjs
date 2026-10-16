import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyOrigin,probe} from '../scripts/eps-sales-owned-route-gate.mjs';
const valid='https://sales.example.org';
const owned={
 '/':['text/html','<html><title>EPS SALES COMMAND</title></html>',200],
 '/health':['application/json',JSON.stringify({ok:true,service:'eps-sales'}),200],
 '/app.js':['text/javascript','fetch("/api/jobs")',200],
 '/style.css':['text/css','body{color:green}',200],
 '/api/jobs':['application/json','{"error":"Sign in required"}',401],
 '/api/me':['application/json','{"error":"Sign in required"}',401]
};
function fake(map=owned){return async url=>{const path=new URL(url).pathname;const row=map[path]||['text/html','Not found',404];return new Response(row[1],{status:row[2],headers:{'content-type':row[0]}})}}
test('no provider URLs, raw HTTP or missing origin can pass',()=>{
 for(const u of [undefined,'http://sales.example.org','https://peak-eps-calc.base44.app','https://foo.github.io','https://sales.example.org/x','https://person:secret@sales.example.org','https://sales.example.org:8443'])assert.throws(()=>verifyOrigin(u));
 assert.equal(verifyOrigin(valid),valid);
});
test('independent EPS route passes public smoke ONLY',async()=>{
 const proof=await probe(valid,{fetcher:fake()});assert.equal(proof.status,'PUBLIC_SMOKE_ONLY');assert.equal(proof.release_authorized,false);assert.equal(proof.photo_upload,'NOT_TESTED');
});
test('200 holding page rejected',async()=>{
 const poisoned={...owned,'/':['text/html',"<h1>EPS Precise Estimator isn't available yet. Publish the app in Builder.</h1>",200]};
 await assert.rejects(probe(valid,{fetcher:fake(poisoned)}),/BLOCKED/);
});
test('denies falsely healthy host or accidentally public customer data',async()=>{
 for(const change of [
  {'/health':['text/html','<html>Not deployed</html>',200]},
  {'/api/jobs':['application/json','[]',200]},
  {'/app.js':['text/html','<html>Provider App</html>',200]}
 ])await assert.rejects(probe(valid,{fetcher:fake({...owned,...change})}),/BLOCKED/);
});
