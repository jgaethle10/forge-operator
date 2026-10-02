import test from "node:test";
import assert from "node:assert/strict";
import {compileRoutes,routeRequest} from "../edge/router.mjs";
const reg={services:[{service_id:"rivet",logical_uri:"evercraft://rivet",public_hosts:["rivet.example.test"],endpoints:[{protocol:"http",url:"http://127.0.0.1:9000",state:"healthy"}]}]};
test("known host maps to permanent service identity",()=>{const r=routeRequest({headers:{host:"RIVET.EXAMPLE.TEST:443"}},compileRoutes(reg));assert.equal(r.logical_uri,"evercraft://rivet");assert.equal(r.status,200)});
test("unknown host fails closed",()=>assert.equal(routeRequest({headers:{host:"evil.test"}},compileRoutes(reg)).status,404));
test("unhealthy endpoint is never promoted",()=>{const x=structuredClone(reg);x.services[0].endpoints[0].state="degraded";assert.equal(routeRequest({headers:{host:"rivet.example.test"}},compileRoutes(x)).status,503)});
test("duplicate host ownership is rejected",()=>assert.throws(()=>compileRoutes({services:[reg.services[0],{...reg.services[0],service_id:"other"}]})));
