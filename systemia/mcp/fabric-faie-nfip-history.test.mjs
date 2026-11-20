import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createFabricFaieSurface} from './fabric-faie-runtime.mjs';

async function withServer(fetchImpl,fn){
  const stateDir=fs.mkdtempSync(path.join(os.tmpdir(),'faie-nfip-route-'));
  const surface=createFabricFaieSurface({
    stateDir,fetchImpl,startResident:false,collectorConfig:{enabled:false}
  });
  const server=createServer(async(req,res)=>{
    try{if(!await surface.handle(req,res)){res.writeHead(404);res.end();}}
    catch{res.writeHead(500);res.end('server_error');}
  });
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const origin='http://127.0.0.1:'+server.address().port;
  try{await fn({origin,stateDir,surface});}
  finally{await new Promise(resolve=>server.close(resolve));await surface.close();fs.rmSync(stateDir,{recursive:true,force:true});}
}
const claims=Array.from({length:12},(_,i)=>({
  id:String(100+i),state:'WA',yearOfLoss:2024,
  amountPaidOnBuildingClaim:1000,amountPaidOnContentsClaim:100,
  amountPaidOnIncreasedCostOfComplianceClaim:0
}));
test('owned public endpoint returns only Washington 2023-24 aggregated NFIP evidence; second request is served from ephemeral memory',async()=>{
  let upstreamRequests=0,sourceUrl='';
  await withServer(async(url)=>{
    upstreamRequests++;sourceUrl=url;
    return {ok:true,text:async()=>JSON.stringify({NfipClaims:claims})};
  },async({origin,surface,stateDir})=>{
    const first=await fetch(origin+'/api/faie/nfip/wa-history');
    assert.equal(first.status,200);
    assert.equal(first.headers.get('cache-control'),'no-store');
    const result=await first.json();
    assert.equal(result.schema,'evercraft.faie.nfip-state-loss-history.v1');
    assert.equal(result.evidence_state,'REPORTED');
    assert.equal(result.geography.level,'state');
    assert.equal(result.geography.state,'WA');
    assert.deepEqual(result.loss_year_range,{first:2023,last:2024});
    assert.equal(result.claim_transactions,12);
    assert.equal(result.total_paid_usd,13200);
    assert.equal(result.parcel_claim_history,null);
    assert.equal(result.insurance_eligibility_decision,null);
    assert.equal(result.request_persisted,false);
    assert.equal(result.decision_authority,false);
    assert.equal(upstreamRequests,1);
    assert.equal(new URL(sourceUrl).host,'www.fema.gov');
    assert.equal(new URL(sourceUrl).searchParams.get('$filter'),"state eq 'WA' and yearOfLoss ge 2023 and yearOfLoss le 2024");
    assert.equal(new URL(sourceUrl).searchParams.get('$orderby'),'id asc');
    const again=await fetch(origin+'/api/faie/nfip/wa-history');
    assert.equal(again.status,200);
    assert.equal(upstreamRequests,1);
    assert.equal(surface.health().investigation_count,0);
    assert.equal(surface.health().comparison_count,0);
    assert.equal(surface.health().observation_count,0);
    const onDisk=fs.readFileSync(path.join(stateDir,'state.json'),'utf8');
    assert.equal(onDisk.includes('claim_transactions'),false);
    assert.equal(onDisk.includes('WA 2023'),false);
    assert.equal(JSON.stringify(result).includes('"id"'),false);
  });
});
test('owned edge never converts missing NFIP payment components into a complete dollar total',async()=>{
  const incomplete=claims.map(row=>({...row}));
  incomplete[0].amountPaidOnContentsClaim=null;
  await withServer(async()=>({ok:true,text:async()=>JSON.stringify({NfipClaims:incomplete})}),async({origin})=>{
    const response=await fetch(origin+'/api/faie/nfip/wa-history');
    assert.equal(response.status,200);
    const result=await response.json();
    assert.equal(result.payment_completeness,'partial');
    assert.equal(result.payment_coverage.records_with_missing_components,1);
    assert.equal(result.total_paid_usd,null);
    assert.equal(result.contents_paid_usd,null);
    assert.equal(result.known_payment_components_usd,13100);
    assert.equal(result.request_persisted,false);
  });
});
test('query string, coordinates and property lookup cannot be supplied to the statewide history endpoint',async()=>{
  let requests=0;
  await withServer(async()=>{requests++;throw Error('upstream_not_authorized')},async({origin})=>{
    for(const query of ['?latitude=46.6&longitude=-120.5','?state=FL','?address=123','?year=2024']){
      const resp=await fetch(origin+'/api/faie/nfip/wa-history'+query);
      assert.equal(resp.status,400);
    }
    assert.equal((await fetch(origin+'/api/faie/nfip/property')).status,404);
    assert.equal(requests,0);
  });
});
test('partial official feeds fail closed; bounded anonymous rate budget enforced',async()=>{
  let requests=0;
  await withServer(async()=>{
    requests++;
    return {ok:false,status:503,text:async()=>''};
  },async({origin})=>{
    for(let i=0;i<2;i++){
      const r=await fetch(origin+'/api/faie/nfip/wa-history');
      assert.equal(r.status,502);
      const data=await r.json();
      assert.equal(data.request_persisted,false);
      assert.equal(data.insurance_eligibility_decision,null);
    }
    const limited=await fetch(origin+'/api/faie/nfip/wa-history');
    assert.equal(limited.status,429);
    assert.equal(requests,2);
  });
});
