#!/usr/bin/env node
import dgram from "node:dgram";
import net from "node:net";

function encodeName(name){return Buffer.concat([...name.replace(/\.$/,"").split(".").map(x=>Buffer.concat([Buffer.from([x.length]),Buffer.from(x)])),Buffer.from([0])])}
function query(name,type=16){const h=Buffer.alloc(12);h.writeUInt16BE(0x4556,0);h.writeUInt16BE(0x0100,2);h.writeUInt16BE(1,4);return Buffer.concat([h,encodeName(name),Buffer.from([0,type,0,1])])}
function inspect(buf){const flags=buf.readUInt16BE(2);return {rcode:flags&15,aa:Boolean(flags&0x0400),ra:Boolean(flags&0x0080),answers:buf.readUInt16BE(6),authority:buf.readUInt16BE(8)}}
export async function probeUdp({server,port=53,name,timeout=3000}){return await new Promise((resolve,reject)=>{const s=dgram.createSocket("udp4"),q=query(name),t=setTimeout(()=>{s.close();reject(new Error("udp_timeout"))},timeout);s.once("message",m=>{clearTimeout(t);s.close();resolve(inspect(m))});s.send(q,port,server)})}
export async function probeTcp({server,port=53,name,timeout=3000}){return await new Promise((resolve,reject)=>{const s=net.connect(port,server),q=query(name),frame=Buffer.alloc(q.length+2);frame.writeUInt16BE(q.length,0);q.copy(frame,2);let buf=Buffer.alloc(0);const t=setTimeout(()=>{s.destroy();reject(new Error("tcp_timeout"))},timeout);s.on("connect",()=>s.write(frame));s.on("data",c=>{buf=Buffer.concat([buf,c]);if(buf.length>=2&&buf.length>=buf.readUInt16BE(0)+2){clearTimeout(t);s.destroy();resolve(inspect(buf.subarray(2,buf.readUInt16BE(0)+2)))}})})}

function arg(name,fallback=''){const i=process.argv.indexOf(name);return i>=0&&process.argv[i+1]?process.argv[i+1]:fallback}
if(process.argv[1]&&import.meta.url===new URL('file:'+process.argv[1]).href){
 const server=arg('--server');
 const name=arg('--name','edge-canary.evercraftpropertyservices.com.');
 const port=Number(arg('--port','53'));
 if(!server) throw new Error('--server required');
 const started=new Date().toISOString();
 const [udp,tcp]=await Promise.allSettled([
  probeUdp({server,port,name,timeout:5000}),
  probeTcp({server,port,name,timeout:5000})
 ]);
 const receipt={
  schema:'evercraft.edge.external-dns-canary.v1',
  server,
  name,
  udp:udp.status==='fulfilled'?{ok:true,...udp.value}:{ok:false,error:String(udp.reason?.message||udp.reason)},
  tcp:tcp.status==='fulfilled'?{ok:true,...tcp.value}:{ok:false,error:String(tcp.reason?.message||tcp.reason)},
  observed_at:started
 };
 receipt.verified=receipt.udp.ok===true&&receipt.tcp.ok===true&&receipt.udp.aa===true&&receipt.tcp.aa===true&&receipt.udp.ra===false&&receipt.tcp.ra===false;
 console.log(JSON.stringify(receipt,null,2));
 if(!receipt.verified) process.exitCode=2;
}
