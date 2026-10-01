#!/usr/bin/env node
import assert from 'node:assert/strict';
import { registerRivetReportGateway } from './http-gateway.mjs';

function fakeApp(){
  const gets=new Map();
  const posts=new Map();
  return {
    gets,posts,
    get(path,handler){gets.set(path,handler);},
    post(path,handler){posts.set(path,handler);}
  };
}

function response(){
  return {
    statusCode:200,
    body:null,
    headers:{},
    setHeader(name,value){this.headers[String(name).toLowerCase()]=String(value);},
    status(code){this.statusCode=code;return this;},
    json(body){this.body=body;return this;}
  };
}

function request({authorization='',body={}}={}){
  return {
    body,
    headers:{authorization},
    get(name){
      if(String(name).toLowerCase()==='authorization') return authorization;
      return '';
    }
  };
}

{
  const app=fakeApp();
  registerRivetReportGateway(app,{
    gatewayToken:'gateway-proof',
    systemiaMachineKey:'machine-proof'
  });
  const res=response();
  app.gets.get('/api/rivet/report-health')({},res);
  assert.equal(res.body.ok,true);
  assert.equal(res.body.configured,false);
  assert.equal(res.body.source_required,true);

  const createRes=response();
  await app.posts.get('/api/rivet/reports')(
    request({
      authorization:'Bearer gateway-proof',
      body:{address:'6405 W Chestnut Ave, Yakima, WA 98908'}
    }),
    createRes
  );
  assert.equal(createRes.statusCode,503);
  assert.equal(createRes.body.error,'rivet_report_gateway_not_configured');
}

{
  const app=fakeApp();
  let calls=0;
  const generate=async({address,systemiaMachineKey,onProgress})=>{
    calls+=1;
    assert.equal(systemiaMachineKey,'machine-proof');
    onProgress({schema:'evercraft.rivet.report-progress.v1',stage:'ready',percent:100});
    return {
      schema:'evercraft.rivet.yard-report-record.v1',
      report_id:'rivet-yard:readiness-proof',
      generation_state:'ready',
      address,
      verification:{football_opened:true}
    };
  };
  registerRivetReportGateway(app,{
    gatewayToken:'gateway-proof',
    systemiaMachineKey:'machine-proof',
    generate
  });
  const healthRes=response();
  app.gets.get('/api/rivet/report-health')({},healthRes);
  assert.equal(healthRes.body.ok,true);
  assert.equal(healthRes.body.configured,true);
  assert.equal(healthRes.body.source_required,false);

  const createRes=response();
  await app.posts.get('/api/rivet/reports')(
    request({
      authorization:'Bearer gateway-proof',
      body:{address:'6405 W Chestnut Ave, Yakima, WA 98908'}
    }),
    createRes
  );
  assert.equal(createRes.statusCode,201);
  assert.equal(createRes.body.ok,true);
  assert.equal(createRes.body.generation_state,'ready');
  assert.equal(createRes.body.progress.percent,100);
  assert.equal(calls,1);
}

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.rivet.gateway-readiness-proof.v1',
  default_generator_requires_owned_source:true,
  injected_generator_can_define_complete_execution_boundary:true,
  health_and_request_admission_share_one_predicate:true
},null,2));
