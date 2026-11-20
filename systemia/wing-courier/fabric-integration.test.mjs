import assert from 'node:assert/strict';
import test from 'node:test';
import {startFabricLocalRuntime} from '../mcp/fabric-local-runtime.mjs';
import {WING_COURIER_FABRIC_PREFIX} from './fabric-proxy.mjs';

test('existing Fabric runtime denies private courier ingress by default',async()=>{
 const fabric=await startFabricLocalRuntime({host:'127.0.0.1',port:0,faieSurfaceEnabled:false,
  wingCourierRouteEnabled:false});
 try{
  const response=await fetch(fabric.url+WING_COURIER_FABRIC_PREFIX+'/v1/inbox?wing=fallen',
   {headers:{authorization:'Bearer '+('a'.repeat(64))}});
  assert.equal(response.status,404);
  const body=await response.json();
  assert.equal(body.error,'not_found');
 }finally{await fabric.close()}
},{timeout:25000});
test('owner-opted Fabric route cannot use custom domains or unknown broker to grant access',async()=>{
 const fabric=await startFabricLocalRuntime({host:'127.0.0.1',port:0,faieSurfaceEnabled:false,
  wingCourierRouteEnabled:true});
 try{
  const path=fabric.url+WING_COURIER_FABRIC_PREFIX+'/v1/inbox?wing=fallen';
  const bad=await fetch(path,{headers:{authorization:'Bearer '+('a'.repeat(64))}});
  assert.equal(bad.status,404,'private path still requires the exact public Fabric host');
  assert.equal((await bad.json()).error,'not_found');
 }finally{await fabric.close()}
},{timeout:25000});
