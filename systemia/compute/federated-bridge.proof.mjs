import assert from 'node:assert/strict';
import http from 'node:http';
import { startFederatedServiceBridge } from '../network/federated-service-bridge.mjs';

const relayToken='proof-relay-authority';
let relayRequests=0;
const relay=http.createServer(async(req,res)=>{
  assert.equal(req.headers.authorization,'Bearer '+relayToken);
  const chunks=[]; for await(const chunk of req)chunks.push(chunk);
  const call=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  relayRequests++;
  let status=404;
  let body={error:'not_found'};
  if(call.method==='GET'&&call.path==='/health'){
    status=200;
    body={ok:true,service:'rivet-yard-report-runtime',runtime:'Evercraft Compute',instance_id:'remote-rivet'};
  }
  if(call.method==='POST'&&call.path==='/echo'){
    status=200;
    body={ok:true,echo:Buffer.from(call.body_base64||'','base64').toString('utf8')};
  }
  const bytes=Buffer.from(JSON.stringify(body));
  const envelope=Buffer.from(JSON.stringify({
    ok:true,status,
    headers:{'content-type':'application/json','cache-control':'no-store'},
    body_base64:bytes.toString('base64')
  }));
  res.writeHead(200,{'content-type':'application/json','content-length':String(envelope.length)});
  res.end(envelope);
});
await new Promise((resolve,reject)=>{relay.once('error',reject);relay.listen(0,'127.0.0.1',resolve);});
const address=relay.address();
const relayUrl='http://127.0.0.1:'+address.port+'/proxy';

const bridge=await startFederatedServiceBridge({relayUrl,relayToken});
try{
  const identity=await fetch(bridge.url+'/__evercraft/health').then(r=>r.json());
  assert.equal(identity.ok,true);
  assert.equal(identity.service,'evercraft-federated-service-bridge');
  assert.equal(identity.runtime,'Evercraft Compute');
  assert.equal(identity.loopback_only,true);
  assert.equal(identity.remote_transport,'evercraft.outbound-capacity.v1');
  assert.equal(identity.relay_token_exposed,false);
  assert.equal(identity.relay_token_persisted,false);
  assert.equal(relayRequests,0,'bridge identity health must not depend on upstream');

  const upstream=await fetch(bridge.url+'/health').then(async r=>({status:r.status,body:await r.json()}));
  assert.equal(upstream.status,200);
  assert.equal(upstream.body.service,'rivet-yard-report-runtime');
  assert.equal(upstream.body.instance_id,'remote-rivet');
  assert.equal(relayRequests,1);

  const echoed=await fetch(bridge.url+'/echo',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({hello:'fabric'})
  }).then(r=>r.json());
  assert.equal(echoed.ok,true);
  assert.equal(JSON.parse(echoed.echo).hello,'fabric');
  assert.equal(relayRequests,2);

  const after=await fetch(bridge.url+'/__evercraft/health').then(r=>r.json());
  assert.equal(after.request_count,2);
  assert.equal(after.last_upstream_status,200);

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.compute.federated-bridge-proof.v1',
    bridge_identity_health_is_local:true,
    remote_workload_health_is_relayed:true,
    bridge_and_upstream_identity_are_distinct:true,
    request_bodies_relayed:true,
    relay_token_exposed:false,
    relay_token_persisted:false
  },null,2));
}finally{
  await bridge.close();
  await new Promise(resolve=>relay.close(()=>resolve()));
}
