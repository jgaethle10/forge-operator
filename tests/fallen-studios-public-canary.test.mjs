import test from "node:test";
import assert from "node:assert/strict";
import {routes,evaluate} from "../scripts/probe-fallen-studios-public.mjs";
test("public canary confirms exact public studio and owned inquiry",()=>{
 assert.deepEqual(routes.map(r=>r.path),["fallen-studios/","commercial-studio/"]);
 for(const route of routes){
  const r=evaluate({status:200,finalUrl:"https://jgaethle10.github.io/forge-operator/"+route.path,body:route.markers.join(" ")},route);
  assert.equal(r.state,"PUBLIC_GET_VERIFIED");
 }
});
test("canary fails closed on fake studio, wrong host, or 404",()=>{
 const route=routes[0];
 const base={status:200,finalUrl:"https://jgaethle10.github.io/forge-operator/fallen-studios/",body:route.markers.join(" ")};
 assert.equal(evaluate({...base,status:404},route).state,"UNVERIFIED");
 assert.equal(evaluate({...base,finalUrl:"https://not-evercraft.example/forge-operator/fallen-studios/"},route).state,"UNVERIFIED");
 assert.equal(evaluate({...base,body:"not actually the studio"},route).state,"UNVERIFIED");
});
