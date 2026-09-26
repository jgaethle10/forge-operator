import assert from 'node:assert/strict';
import express from 'express';
import { registerRivetReportGateway } from '../systemia/rivet/http-gateway.mjs';

async function start(options){
  const app=express();
  app.use(express.json());
  registerRivetReportGateway(app,options);
  const server=await new Promise((resolve,reject)=>{
    const s=app.listen(0,'127.0.0.1',()=>resolve(s));
    s.once('error',reject);
  });
  const address=server.address();
  return {
    url:'http://127.0.0.1:'+address.port,
    close:()=>new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()))
  };
}

const fakeGenerate=async({address,systemiaMachineKey,onProgress})=>{
  assert.equal(systemiaMachineKey,'machine-proof');
  onProgress({schema:'evercraft.rivet.report-progress.v1',stage:'ready',percent:100});
  return {
    schema:'evercraft.rivet.yard-report-record.v1',
    report_id:'rivet-yard:proof',
    generation_state:'ready',
    address,
    verification:{source_response_profile_verified:true,football_opened:true}
  };
};

{
  const runtime=await start({gatewayToken:'',systemiaMachineKey:'machine-proof',generate:fakeGenerate});
  try{
    const r=await fetch(runtime.url+'/api/rivet/reports',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({address:'6405 W Chestnut Ave'})});
    assert.equal(r.status,503);
  }finally{await runtime.close();}
}

{
  const runtime=await start({gatewayToken:'gateway-proof',systemiaMachineKey:'machine-proof',generate:fakeGenerate});
  try{
    const health=await fetch(runtime.url+'/api/rivet/report-health').then(r=>r.json());
    assert.equal(health.ok,true);
    assert.equal(health.configured,true);

    const denied=await fetch(runtime.url+'/api/rivet/reports',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer wrong'},body:JSON.stringify({address:'6405 W Chestnut Ave'})});
    assert.equal(denied.status,401);

    const missing=await fetch(runtime.url+'/api/rivet/reports',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer gateway-proof'},body:JSON.stringify({address:''})});
    assert.equal(missing.status,400);

    const created=await fetch(runtime.url+'/api/rivet/reports',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer gateway-proof'},body:JSON.stringify({address:'6405 W Chestnut Ave, Yakima, WA 98908'})});
    assert.equal(created.status,201);
    const body=await created.json();
    assert.equal(body.ok,true);
    assert.equal(body.generation_state,'ready');
    assert.equal(body.progress.percent,100);
    assert.equal(body.verification.football_opened,true);
  }finally{await runtime.close();}
}

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.rivet.yard-gateway-proof.v1',
  fail_closed_when_unconfigured:true,
  auth_required:true,
  address_required:true,
  ready_report_returned:true
},null,2));
