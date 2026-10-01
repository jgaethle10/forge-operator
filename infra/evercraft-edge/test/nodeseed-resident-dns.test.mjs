import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import dgram from "node:dgram";
import {startEvercraftComputeNode} from "../../../systemia/compute/runtime-node.mjs";

async function freePort(){
  const s=dgram.createSocket("udp4");
  await new Promise((resolve,reject)=>{s.once("error",reject);s.bind(0,"127.0.0.1",resolve)});
  const p=s.address().port;
  await new Promise(resolve=>s.close(resolve));
  return p;
}
async function json(url,options={}){
  const res=await fetch(url,options);
  const body=await res.json();
  assert.equal(res.ok,true,JSON.stringify(body));
  return body;
}
test("NodeSeed can lease, start, and health-check Edge DNS resident workload",async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"evercraft-edge-nodeseed-"));
  const snapshot=path.join(root,"canary-zone.json");
  fs.writeFileSync(snapshot,JSON.stringify({
    origin:"edge.invalid.",serial:1,default_ttl:60,
    primary_ns:"ns1.edge.invalid.",admin:"hostmaster.edge.invalid.",
    nameservers:["ns1.edge.invalid.","ns2.edge.invalid."],
    records:[{name:"_evercraft",type:"TXT",value:"service=evercraft://edge/test"}]
  }));
  const token="test_allocator_token_1234567890";
  const dnsPort=await freePort();
  const node=await startEvercraftComputeNode({
    nodeId:"edge-test-node",root,host:"127.0.0.1",port:0,allocatorToken:token,
    placementLabels:["operator-authorized","public-edge-candidate","evercraft-edge-dns"]
  });
  try{
    const capacity=await json(node.endpoint+"/v1/capacity");
    assert.ok(capacity.supported_workloads.includes("systemia.evercraft-edge-dns.v1"));

    const lease=await json(node.endpoint+"/v1/leases",{
      method:"POST",
      headers:{"content-type":"application/json","authorization":"Bearer "+token},
      body:JSON.stringify({workload_class:"systemia.evercraft-edge-dns.v1",requested_ttl_ms:300000})
    });
    const job=await json(node.endpoint+"/v1/jobs",{
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({
        lease_id:lease.lease_id,token:lease.token,release_ref:"a".repeat(40),
        workload_class:"systemia.evercraft-edge-dns.v1",
        input:{snapshot_path:snapshot,dns_host:"127.0.0.1",dns_port:dnsPort,health_port:0}
      })
    });
    const health=await json(node.endpoint+job.result.health_path);
    assert.equal(health.service,"evercraft-edge-dns");
    assert.equal(health.authoritative,true);
    assert.equal(health.recursive,false);
    assert.equal(health.dns_udp,true);
    assert.equal(health.dns_tcp,true);
    assert.match(health.snapshot_sha256,/^sha256:[a-f0-9]{64}$/);
  }finally{
    await node.close();
    fs.rmSync(root,{recursive:true,force:true});
  }
});
