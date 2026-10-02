import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { start as startDns, loadSnapshot } from "../../infra/evercraft-edge/dns/runtime.mjs";

export async function startEvercraftEdgeDnsRuntime({
  snapshotPath,
  dnsHost="127.0.0.1",
  dnsPort=1053,
  healthHost="127.0.0.1",
  healthPort=0,
  queryReceiptPath="",
  receiptQname="",
}={}){
  if(!snapshotPath) throw new Error("edge_dns_snapshot_path_required");
  const initial=loadSnapshot(snapshotPath);
  const instanceId="edge_dns_"+crypto.randomBytes(8).toString("hex");
  const recentReceipts=[];
  const normalizedReceiptQname=String(receiptQname||"").toLowerCase();
  const persistReceipt=(receipt)=>{
    if(!receipt)return;
    if(normalizedReceiptQname && receipt.qname!==normalizedReceiptQname)return;
    const body={schema:"evercraft.edge.dns-exchange-receipt.v1",instance_id:instanceId,...receipt,observed_at:new Date().toISOString()};
    recentReceipts.push(body);
    if(recentReceipts.length>64)recentReceipts.splice(0,recentReceipts.length-64);
    if(queryReceiptPath){
      fs.mkdirSync(path.dirname(queryReceiptPath),{recursive:true,mode:0o750});
      const tmp=queryReceiptPath+"."+process.pid+".tmp";
      fs.writeFileSync(tmp,JSON.stringify({schema:"evercraft.edge.dns-exchange-receipts.v1",receipts:recentReceipts},null,2)+"\n",{mode:0o600});
      fs.renameSync(tmp,queryReceiptPath);
    }
  };
  const dns=startDns({snapshotPath,host:dnsHost,port:Number(dnsPort),onExchange:persistReceipt});
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
      dns_bind_port:Number(dnsPort),
      query_receipt_path:queryReceiptPath||null,
      receipt_qname:normalizedReceiptQname||null,
      recent_receipt_count:recentReceipts.length
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
    recentReceipts:()=>recentReceipts.slice(),
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
