import test from "node:test";
import assert from "node:assert/strict";
import {ORIGIN,ASSETS,evaluatePublicAsset} from "../scripts/probe-evercraft-research-public.mjs";

test("checks source identity, HTTPS and explicit page evidence",()=>{
 const asset=ASSETS[0];
 const good=evaluatePublicAsset({
  status:200,final_url:ORIGIN,content_type:"text/html; charset=utf-8",
  body:"Evercraft Research\nPrepare my research brief\nscope.mjs"
 },asset);
 assert.equal(good.state,"PUBLIC_GET_VERIFIED");
 assert.deepEqual(good.findings,[]);
});

test("a 404, wrong host, or generic HTML fails without a false launch receipt",()=>{
 const asset=ASSETS[0];
 const base={status:200,final_url:ORIGIN,content_type:"text/html",body:"Evercraft Research Prepare my research brief scope.mjs"};
 assert.ok(evaluatePublicAsset({...base,status:404},asset).findings.includes("HTTP_NOT_200"));
 assert.ok(evaluatePublicAsset({...base,final_url:"https://evil.example/forge-operator/research/"},asset).findings.includes("WRONG_PUBLIC_ORIGIN"));
 assert.ok(evaluatePublicAsset({...base,body:"Some default website"},asset).findings.some(x=>x.startsWith("MISSING_MARKER")));
 assert.ok(evaluatePublicAsset({...base,content_type:"text/html",final_url:"http://jgaethle10.github.io/forge-operator/research/"},asset).findings.includes("WRONG_PUBLIC_ORIGIN"));
});

test("canary only looks at public surfaces and contains no payment path",()=>{
 assert.deepEqual(ASSETS.map(x=>x.path),["","scope.mjs","ai-discovery.json","llms.txt","share/","share/captions.json","assets/research-mark.svg"]);
 for(const a of ASSETS)assert.ok(a.expected.length>=2);
 assert.match(ORIGIN,/^https:\/\//);
});
