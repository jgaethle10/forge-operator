import http from "node:http";
import crypto from "node:crypto";
import { start as startDns, loadSnapshot } from "../../infra/evercraft-edge/dns/runtime.mjs";

export async function startEvercraftEdgeDnsRuntime({
  snapshotPath,
  dnsHost="127.0.0.1",
  dnsPort=5353,
  healthHost="127.0.0.1",
  healthPort=0,
}={}){
  if(!snapshotPath) throw new Error("edge_dns_snapshot_path_required");
  const initial=loadSnapshot(snapshotPath);
  const instanceId="edge_dns_"+crypto.randomBytes(8).toString("hex");
  const dns=startDns({snapshotPath,host:dnsHost,port:Number(dnsPort)});
  const healthState=()=>{
    const snap=dns.getSnapshot();
    return {
      ok:true,
      service:"evercraft-edge-dns",
      runtime:"Evercraft Compute",
      workload_class:"systemia.evercraft-edge-dns.v1",
      instance_id:instanceId,
      authoritative:true,
      recursive:false,
      snapshot_sha256:snap.hash,
      serial:snap.zone.serial,
      origin:snap.zone.origin,
      dns_udp:true,
      dns_tcp:true,
      dns_bind_host:dnsHost,
      dns_bind_port:Number(dnsPort)
    };
  };
  const health=http.createServer((req,res)=>{
    if(req.url!=="/health"){res.writeHead(404);return res.end()}
    res.writeHead(200,{"content-type":"application/json"});
    res.end(JSON.stringify(healthState()));
  });
  await new Promise((resolve,reject)=>{
    health.once("error",reject);
    health.listen(Number(healthPort),healthHost,resolve);
  });
  const addr=health.address();
  return {
    instanceId,
    healthUrl:"http://"+healthHost+":"+addr.port+"/health",
    initialSnapshotHash:initial.hash,
    health:()=>healthState(),
    reload:()=>dns.reload(),
    async close(){
      await Promise.allSettled([
        new Promise(r=>dns.udp.close(()=>r())),
        new Promise(r=>dns.tcp.close(()=>r())),
        new Promise(r=>health.close(()=>r()))
      ]);
    }
  };
}
