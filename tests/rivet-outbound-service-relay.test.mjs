import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startNodeSeed } from '../systemia/compute/node-seed.mjs';
import { YardOperator } from '../systemia/yard/operator.mjs';
import { startOutboundCapacityBroker } from '../systemia/network/outbound-capacity-broker.mjs';
import { startOutboundNodeAgent } from '../systemia/network/outbound-node-agent.mjs';
import { persistAliEvSnapshot } from '../systemia/aliev/source-runtime.mjs';

const COVERAGE_DOMAINS=[
  'geocoding','charging_inventory','traffic','traffic_temporal',
  'utility_service_area','utility_tariff','incentives','parcel_planning',
  'local_ev_stock','observed_sessions','freight','dwell_context',
  'deep_market_evidence','provenance',
];

function decodeBridge(body){
  assert.equal(body?.ok,true);
  const raw=Buffer.from(String(body.body_base64||''),'base64').toString('utf8');
  return {status:Number(body.status),body:raw?JSON.parse(raw):null};
}

async function relayRequest(broker,relay,{method='GET',path='/',headers={},body=null}={}){
  const response=await fetch(broker.endpoint+relay.proxy_path,{
    method:'POST',
    headers:{
      'content-type':'application/json',
      authorization:'Bearer '+relay.relay_token,
    },
    body:JSON.stringify({
      method,
      path,
      headers,
      body_base64:body==null?'':Buffer.from(JSON.stringify(body)).toString('base64'),
    }),
  });
  return {status:response.status,body:await response.json()};
}

test('RIVET remains usable through Evercraft outbound relay when private node has no public ingress',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'rivet-outbound-relay-'));
  const computeRoot=path.join(root,'node');
  const yardRoot=path.join(root,'yard');
  const brokerRoot=path.join(root,'broker');
  const alievState=path.join(computeRoot,'aliev');
  const rivetState=path.join(computeRoot,'rivet');
  const address='19820 International Blvd, SeaTac, WA 98188';
  const allocatorToken='local-proof-allocator-secret';
  const systemiaMachineKey='systemia-proof-machine-key';
  const ingestToken='aliev-proof-ingest-token';
  const teamToken='rivet-proof-team-token';
  const releaseRef='a'.repeat(40);
  const oldEnv={
    machine:process.env.SYSTEMIA_MACHINE_KEY,
    ingest:process.env.ALIEV_OWNED_INGEST_TOKEN,
    team:process.env.RIVET_YARD_TEAM_TOKEN,
  };
  process.env.SYSTEMIA_MACHINE_KEY=systemiaMachineKey;
  process.env.ALIEV_OWNED_INGEST_TOKEN=ingestToken;
  process.env.RIVET_YARD_TEAM_TOKEN=teamToken;

  persistAliEvSnapshot({
    stateDir:alievState,
    snapshot:{
      response_profile:'rivet_report_snapshot_v1',
      evidence_state:'SOURCE_BACKED',
      matched_address:address,
      latitude:47.443,
      longitude:-122.296,
      state:'WA',
      postal_code:'98188',
      retrieved_at:new Date().toISOString(),
      access_policy:{commercial_access:true},
      source_coverage_manifest:{
        schema:'evercraft.rivet.source-coverage.v1',
        domains:Object.fromEntries(COVERAGE_DOMAINS.map((key)=>[
          key,
          {state:key==='observed_sessions'?'OBSERVED_VERIFIED':'CONNECTED',record_count:key==='observed_sessions'?1:0,source_status:'relay-proof'},
        ])),
        semantics:'Missing is never zero.',
      },
      source_record_ids:['relay-proof-source-001'],
      chargers:[{name:'Nearby DC fast charger',ports:8,power_kw:250}],
      traffic:[{aadt:52000,source:'relay-proof'}],
      nearby_observed_usage:[{
        evidence_state:'observed',
        charging_sessions_count:144,
        period_start:'2026-09-01T00:00:00Z',
        period_end:'2026-10-01T00:00:00Z',
        source_ref:'relay-proof-session-001',
      }],
    },
  });

  let seed=null;
  let broker=null;
  let agent=null;
  try{
    seed=await startNodeSeed({
      root:computeRoot,
      nodeId:'rivet-relay-proof-node',
      host:'127.0.0.1',
      port:0,
      advertiseHost:'127.0.0.1',
      allocatorToken,
      announce:false,
    });
    broker=await startOutboundCapacityBroker({
      stateDir:brokerRoot,
      authorizedDevices:{[seed.device_fingerprint]:seed.node_id},
      pollWaitMs:50,
      commandTimeoutMs:15_000,
      capacityFreshMs:2_000,
    });
    agent=await startOutboundNodeAgent({
      brokerUrl:broker.endpoint,
      localCapacityEndpoint:seed.endpoint,
      localAllocatorToken:allocatorToken,
      pollBackoffMs:20,
    });

    assert.equal(agent.status().public_ingress,false);
    const grant=broker.controlGrant(seed.node_id);
    assert.ok(grant);

    const yard=new YardOperator({stateDir:yardRoot});
    const aliev=await yard.deployRelease({
      deploymentId:'aliev-source-runtime',
      releaseRef,
      workloadClass:'systemia.aliev-source-runtime.v1',
      capacityEndpoint:grant.capacity_endpoint,
      allocatorToken:grant.allocator_token,
      input:{state_root:alievState},
      rollbackTarget:'proof:aliev-source-previous',
      leaseTtlMs:120_000,
    });
    assert.equal(aliev.state,'ready');
    assert.match(String(aliev.result.source_url),/^http:\/\/127\.0\.0\.1:/);

    const rivet=await yard.deployRelease({
      deploymentId:'rivet-report-runtime',
      releaseRef,
      workloadClass:'systemia.rivet-report-runtime.v1',
      capacityEndpoint:grant.capacity_endpoint,
      allocatorToken:grant.allocator_token,
      input:{state_root:rivetState,source_url:aliev.result.source_url},
      rollbackTarget:'proof:rivet-report-previous',
      leaseTtlMs:120_000,
    });
    assert.equal(rivet.state,'ready');

    const relay=await broker.createServiceRelay({
      nodeId:seed.node_id,
      serviceId:rivet.result.service_id,
      ttlMs:120_000,
    });
    assert.equal(relay.target_service,'rivet-yard-report-runtime');

    const healthWire=await relayRequest(broker,relay,{path:'/health'});
    assert.equal(healthWire.status,200);
    const health=decodeBridge(healthWire.body);
    assert.equal(health.status,200);
    assert.equal(health.body.service,'rivet-yard-report-runtime');

    const unauthorizedWire=await relayRequest(broker,relay,{
      method:'POST',
      path:'/v1/reports',
      body:{address,report_type:'preliminary_site_opportunity'},
    });
    assert.equal(unauthorizedWire.status,200);
    const unauthorized=decodeBridge(unauthorizedWire.body);
    assert.equal(unauthorized.status,401);
    assert.equal(unauthorized.body.error,'team_authorization_required');

    const generatedWire=await relayRequest(broker,relay,{
      method:'POST',
      path:'/v1/reports',
      headers:{authorization:'Bearer '+teamToken},
      body:{address,report_type:'preliminary_site_opportunity'},
    });
    assert.equal(generatedWire.status,200);
    const generated=decodeBridge(generatedWire.body);
    assert.equal(generated.status,201);
    assert.equal(generated.body.generation_state,'ready');
    assert.equal(generated.body.report.body.source.system,'AliEV');
    assert.equal(
      generated.body.report.body.evidence.observed_usage[0].charging_sessions_count,
      144
    );

    const reportId=generated.body.report_id;
    const reportWire=await relayRequest(broker,relay,{
      method:'GET',
      path:'/v1/reports/'+encodeURIComponent(reportId),
      headers:{authorization:'Bearer '+teamToken},
    });
    assert.equal(reportWire.status,200);
    const reportRead=decodeBridge(reportWire.body);
    assert.equal(reportRead.status,200);
    assert.equal(reportRead.body.report_id,reportId);

    const blocked=await relayRequest(broker,relay,{
      method:'POST',
      path:'/admin',
      headers:{authorization:'Bearer '+teamToken},
      body:{},
    });
    assert.equal(blocked.status,422);
    assert.equal(blocked.body.error,'rivet_report_bridge_route_not_allowed');

    const released=broker.releaseServiceRelay(relay.relay_id,'proof_complete');
    assert.equal(released.released,true);
  }finally{
    if(agent) await agent.close().catch(()=>{});
    if(broker) await broker.close().catch(()=>{});
    if(seed) await seed.close().catch(()=>{});
    if(oldEnv.machine===undefined) delete process.env.SYSTEMIA_MACHINE_KEY; else process.env.SYSTEMIA_MACHINE_KEY=oldEnv.machine;
    if(oldEnv.ingest===undefined) delete process.env.ALIEV_OWNED_INGEST_TOKEN; else process.env.ALIEV_OWNED_INGEST_TOKEN=oldEnv.ingest;
    if(oldEnv.team===undefined) delete process.env.RIVET_YARD_TEAM_TOKEN; else process.env.RIVET_YARD_TEAM_TOKEN=oldEnv.team;
    fs.rmSync(root,{recursive:true,force:true});
  }
});
