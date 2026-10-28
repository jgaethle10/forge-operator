#!/usr/bin/env node
/**
 * External canary for the public Evercraft broker.
 *
 * This is a read-only proof from a runner outside the Chromebook LAN.
 * No credentials, enrollment or mutation endpoints are called.
 */
const origin='https://fabric.systemiacommandcenters.com';
const expectedInstance='remote_broker_8a9b5bfcec4231bd15ed375c';
const expectedReceipt='e5649a6b8317d99d18457053c3987283b5696084cae92089a1823e0b8203ad0c';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function probe(path,{method='GET'}={}){
  const url=new URL(path,origin);
  const response=await fetch(url,{
    method,
    headers:{accept:'application/json'},
    signal:AbortSignal.timeout(7000),
    redirect:'error',
  });
  const raw=await response.text();
  let body=null;
  try{body=JSON.parse(raw)}catch{}
  return {status:response.status,body};
}
async function run(){
  let lastError=null,broker=null,fabric=null;
  for(let i=0;i<4;i++){
    try{
      [fabric,broker]=await Promise.all([
        probe('/mcp'),probe('/v1/remote/health'),
      ]);
      if(fabric.status===200&&broker.status===200){lastError=null;break;}
      lastError='unexpected_http_status';
    }catch(e){
      lastError=e?.code||e?.name||'transport_error';
    }
    if(i<3)await sleep(1200);
  }
  let nodes=null,actualWorkerRoute=null,wrongMethod=null;
  try{
    [nodes,actualWorkerRoute,wrongMethod]=await Promise.all([
      probe('/nodes/not-enrolled/v1/capacity'),
      probe('/nodes/evercraft-node002-nextgen/v1/health'),
      probe('/v1/remote/register'),
    ]);
  }catch(e){
    lastError=lastError||e?.name||'denied_path_probe_error';
  }

  const h=broker?.body;
  const bindingOk=h?.ok===true &&
    h?.schema==='evercraft.remote-capacity.broker-health.v1' &&
    h?.runtime==='Evercraft Compute' &&
    h?.service==='remote-capacity-broker' &&
    h?.instance_id===expectedInstance &&
    h?.deployment_receipt_bound===true &&
    h?.deployment_receipt_ref===expectedReceipt &&
    h?.secure_envelope_schema==='evercraft.secure-envelope.v1';
  const boundaryOk=nodes?.status===404 && actualWorkerRoute?.status===404 && wrongMethod?.status===404;
  const validDeviceCounts=Number.isInteger(h?.authorized_devices) &&
    h.authorized_devices>=1 && Number.isInteger(h?.registered_nodes) &&
    h.registered_nodes>=0;
  const ok=fabric?.status===200 &&
    broker?.status===200 && bindingOk && boundaryOk && validDeviceCounts;
  const result={
    schema:'evercraft.remote-capacity.independent-public-canary.v1',
    checked_at:new Date().toISOString(),
    observed_from:'github_hosted_runner',
    origin,
    public_fabric_mcp_status:fabric?.status||null,
    broker_https_health_status:broker?.status||null,
    instance_id_matches: h?.instance_id===expectedInstance,
    yard_deployment_receipt_matches:h?.deployment_receipt_ref===expectedReceipt,
    deployment_receipt_bound:h?.deployment_receipt_bound===true,
    broker_transport_schema_valid:h?.secure_envelope_schema==='evercraft.secure-envelope.v1',
    unauthenticated_worker_path_denied:nodes?.status===404,
    authorized_worker_path_denied_publicly:actualWorkerRoute?.status===404,
    wrong_method_denied:wrongMethod?.status===404,
    authorized_devices_reported:h?.authorized_devices??null,
    registered_session_count_reported:h?.registered_nodes??null,
    expected_authorized_device_count_present:validDeviceCounts,
    public_broker_reachable_independently:ok,
    scope:'read_only',
    remote_compute_session_registered_at_probe:Number(h?.registered_nodes||0)>0,
    work_dispatch_verified:false,
    error_code:lastError,
  };
  console.log(JSON.stringify(result,null,2));
  if(!ok)process.exitCode=1;
}
await run();
