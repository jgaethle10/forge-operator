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

function request(body){
  return {
    body,
    headers:{authorization:'Bearer gateway-proof'},
    get(name){return String(name).toLowerCase()==='authorization'?'Bearer gateway-proof':'';}
  };
}

const generate=async({address,onProgress})=>{
  onProgress({schema:'evercraft.rivet.report-progress.v1',stage:'ready',percent:100});
  return {
    schema:'evercraft.rivet.yard-report-record.v1',
    report_id:'rivet-yard:relay-proof',
    generation_state:'ready',
    address,
    verification:{football_opened:true}
  };
};

{
  const intents=[];
  const relay={
    enqueueIntent(intent,options){
      intents.push({intent,options});
      return {job:{id:'relay-job-1',status:'pending',duplicate:false},intent};
    }
  };
  const app=fakeApp();
  registerRivetReportGateway(app,{
    gatewayToken:'gateway-proof',
    systemiaMachineKey:'machine-proof',
    generate,
    relay
  });

  const health=response();
  app.gets.get('/api/rivet/report-health')({},health);
  assert.equal(health.body.notification_fabric_connected,true);

  const res=response();
  await app.posts.get('/api/rivet/reports')(request({
    address:'6405 W Chestnut Ave, Yakima, WA 98908',
    notification_principal_id:'owner'
  }),res);
  assert.equal(res.statusCode,201);
  assert.equal(res.body.notification.state,'queued');
  assert.equal(intents.length,1);
  assert.deepEqual(intents[0].intent.recipient_ids,['owner']);
  assert.equal(intents[0].intent.data.report_id,'rivet-yard:relay-proof');
  assert.equal(intents[0].intent.data.action,'open_rivet_report');
  assert.equal(JSON.stringify(intents[0].intent).includes('6405 W Chestnut'),false);
  assert.match(intents[0].options.idempotencyKey,/^rivet:report-ready:/);
}

{
  let calls=0;
  const relay={
    enqueueIntent(){
      calls+=1;
      throw new Error('relay unavailable');
    }
  };
  const app=fakeApp();
  registerRivetReportGateway(app,{
    gatewayToken:'gateway-proof',
    systemiaMachineKey:'machine-proof',
    generate,
    relay
  });
  const res=response();
  await app.posts.get('/api/rivet/reports')(request({
    address:'6405 W Chestnut Ave, Yakima, WA 98908',
    notification_principal_id:'owner'
  }),res);
  assert.equal(calls,1);
  assert.equal(res.statusCode,201);
  assert.equal(res.body.generation_state,'ready');
  assert.equal(res.body.notification.state,'enqueue_failed');
}

{
  let calls=0;
  const relay={
    enqueueIntent(){calls+=1;return {job:{id:'should-not-run'}};}
  };
  const app=fakeApp();
  registerRivetReportGateway(app,{
    gatewayToken:'gateway-proof',
    systemiaMachineKey:'machine-proof',
    generate,
    relay
  });
  const res=response();
  await app.posts.get('/api/rivet/reports')(request({
    address:'6405 W Chestnut Ave, Yakima, WA 98908'
  }),res);
  assert.equal(res.statusCode,201);
  assert.equal(res.body.notification.state,'not_requested');
  assert.equal(calls,0);
}

{
  const signals=[];
  const relay={
    enqueueSignal(signal,options){
      signals.push({signal,options});
      return {job:{id:'relay-signal-1',status:'pending',duplicate:false}};
    }
  };
  const app=fakeApp();
  registerRivetReportGateway(app,{
    gatewayToken:'gateway-proof',
    systemiaMachineKey:'machine-proof',
    generate:async()=>{throw new Error('snapshot_failed:sensitive-detail');},
    relay
  });
  const res=response();
  await app.posts.get('/api/rivet/reports')(request({
    address:'6405 W Chestnut Ave, Yakima, WA 98908'
  }),res);
  assert.equal(res.statusCode,502);
  assert.equal(res.body.operator_signal.state,'queued');
  assert.equal(signals.length,1);
  assert.equal(signals[0].signal.product,'rivet');
  assert.equal(signals[0].signal.source,'rivet-yard-report-gateway');
  assert.equal(signals[0].signal.status,'failed');
  assert.equal(signals[0].signal.evidence_state,'live_verified');
  assert.equal(signals[0].signal.error_code,'snapshot_failed');
  assert.equal(JSON.stringify(signals[0].signal).includes('6405 W Chestnut'),false);
}

{
  const app=fakeApp();
  registerRivetReportGateway(app,{
    gatewayToken:'gateway-proof',
    systemiaMachineKey:'machine-proof',
    generate
  });
  const res=response();
  await app.posts.get('/api/rivet/reports')(request({
    address:'6405 W Chestnut Ave, Yakima, WA 98908',
    notification_principal_id:'x'.repeat(257)
  }),res);
  assert.equal(res.statusCode,400);
  assert.equal(res.body.error,'notification_principal_id_invalid');
}

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.rivet.relay-integration-proof.v1',
  private_report_ready_targeting:true,
  address_excluded_from_notification_payload:true,
  relay_failure_does_not_poison_report_success:true,
  report_failure_routes_generic_operator_signal:true,
  optional_notification_principal_is_bounded:true
},null,2));
