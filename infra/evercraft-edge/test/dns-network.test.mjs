import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import dgram from "node:dgram";
import {start} from "../dns/runtime.mjs";
import {probeUdp,probeTcp} from "../dns/probe.mjs";

async function freePort(){
 const s=dgram.createSocket("udp4");
 await new Promise((resolve,reject)=>{s.once("error",reject);s.bind(0,"127.0.0.1",resolve)});
 const p=s.address().port;
 await new Promise(resolve=>s.close(resolve));
 return p;
}
test("authoritative runtime answers real UDP and TCP DNS",async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"evercraft-edge-dns-"));
 const file=path.join(root,"zone.json");
 fs.writeFileSync(file,JSON.stringify({
  origin:"edge.invalid.",serial:1,default_ttl:60,
  primary_ns:"ns1.edge.invalid.",admin:"hostmaster.edge.invalid.",
  nameservers:["ns1.edge.invalid.","ns2.edge.invalid."],
  records:[{name:"_evercraft",type:"TXT",value:"service=evercraft://edge/test"}]
 }));
 const port=await freePort();
 const runtime=start({snapshotPath:file,host:"127.0.0.1",port});
 try{
  await Promise.all([
   runtime.udp.address().port?Promise.resolve():new Promise(r=>runtime.udp.once("listening",r)),
   runtime.tcp.listening?Promise.resolve():new Promise(r=>runtime.tcp.once("listening",r))
  ]);
  const [udp,tcp]=await Promise.all([
   probeUdp({server:"127.0.0.1",port,name:"_evercraft.edge.invalid."}),
   probeTcp({server:"127.0.0.1",port,name:"_evercraft.edge.invalid."})
  ]);
  assert.equal(udp.aa,true); assert.equal(udp.ra,false);
  assert.equal(tcp.aa,true); assert.equal(tcp.ra,false);
  assert.equal(udp.answers,1); assert.equal(tcp.answers,1);
 }finally{
  await Promise.all([
   new Promise(r=>runtime.udp.close(()=>r())),
   new Promise(r=>runtime.tcp.close(()=>r()))
  ]);
  fs.rmSync(root,{recursive:true,force:true});
 }
});
