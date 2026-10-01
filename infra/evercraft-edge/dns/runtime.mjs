#!/usr/bin/env node
import dgram from "node:dgram";
import net from "node:net";
import fs from "node:fs";
import crypto from "node:crypto";

const TYPE={A:1,NS:2,CNAME:5,SOA:6,MX:15,TXT:16,AAAA:28,SRV:33,CAA:257};
const TYPE_NAME=Object.fromEntries(Object.entries(TYPE).map(([k,v])=>[v,k]));

function u16(n){const b=Buffer.alloc(2);b.writeUInt16BE(n);return b}
function u32(n){const b=Buffer.alloc(4);b.writeUInt32BE(n>>>0);return b}
function nameBuf(name){
 const labels=String(name).replace(/\.$/,"").split(".");
 return Buffer.concat([...labels.map(x=>Buffer.concat([Buffer.from([Buffer.byteLength(x)]),Buffer.from(x)])),Buffer.from([0])]);
}
function readName(buf,off){
 const labels=[]; let jumped=false,end=off,guard=0;
 while(guard++<128){
  const len=buf[off];
  if((len&0xc0)===0xc0){const ptr=((len&0x3f)<<8)|buf[off+1];if(!jumped)end=off+2;off=ptr;jumped=true;continue}
  if(len===0){if(!jumped)end=off+1;break}
  labels.push(buf.subarray(off+1,off+1+len).toString());off+=1+len;if(!jumped)end=off;
 }
 return {name:labels.join(".").toLowerCase()+".",end};
}
function ipv4(s){return Buffer.from(s.split(".").map(Number))}
function ipv6(s){
 const [l,r]=s.split("::");const L=l?l.split(":"):[],R=r?r.split(":"):[];
 const parts=[...L,...Array(8-L.length-R.length).fill("0"),...R];
 const b=Buffer.alloc(16);parts.forEach((p,i)=>b.writeUInt16BE(parseInt(p||"0",16),i*2));return b;
}
function rdata(type,r){
 if(type==="A")return ipv4(r.value);
 if(type==="AAAA")return ipv6(r.value);
 if(["NS","CNAME"].includes(type))return nameBuf(r.value);
 if(type==="TXT"){const x=Buffer.from(String(r.value));return Buffer.concat([Buffer.from([Math.min(x.length,255)]),x.subarray(0,255)])}
 if(type==="MX")return Buffer.concat([u16(r.priority??10),nameBuf(r.value)]);
 if(type==="SRV")return Buffer.concat([u16(r.priority??0),u16(r.weight??0),u16(r.port),nameBuf(r.value)]);
 if(type==="CAA"){const tag=Buffer.from(r.tag??"issue"),v=Buffer.from(String(r.value));return Buffer.concat([Buffer.from([r.flags??0,tag.length]),tag,v])}
 throw new Error("unsupported rdata "+type);
}
function rr(name,type,r,ttl){const data=rdata(type,r);return Buffer.concat([nameBuf(name),u16(TYPE[type]),u16(1),u32(ttl),u16(data.length),data])}
function soa(zone){
 const data=Buffer.concat([nameBuf(zone.primary_ns),nameBuf(zone.admin),u32(zone.serial),u32(300),u32(120),u32(1209600),u32(300)]);
 return Buffer.concat([nameBuf(zone.origin),u16(TYPE.SOA),u16(1),u32(zone.default_ttl??300),u16(data.length),data]);
}
export function loadSnapshot(path){
 const raw=fs.readFileSync(path);const zone=JSON.parse(raw);
 const hash="sha256:"+crypto.createHash("sha256").update(raw).digest("hex");
 return {zone,hash};
}
export function answer(packet,zone){
 if(packet.length<12)return null;
 const id=packet.subarray(0,2), flags=packet.readUInt16BE(2), qd=packet.readUInt16BE(4);
 if(qd!==1)return Buffer.concat([id,u16(0x8401),u16(0),u16(0),u16(0),u16(0)]);
 const q=readName(packet,12);const qtype=packet.readUInt16BE(q.end),qclass=packet.readUInt16BE(q.end+2);
 const question=packet.subarray(12,q.end+4), origin=zone.origin.toLowerCase();
 if(qclass!==1||!q.name.endsWith(origin))return Buffer.concat([id,u16(0x8405),u16(1),u16(0),u16(0),u16(0),question]);
 const fqdn=r=>r.name==="@"?origin:(String(r.name).endsWith(".")?String(r.name).toLowerCase():String(r.name).toLowerCase()+"."+origin);
 const records=(zone.records||[]).map(r=>({...r,type:String(r.type).toUpperCase()}));
 const exact=records.filter(r=>fqdn(r)===q.name);
 const hasDescendant=records.some(r=>fqdn(r).endsWith("."+q.name));
 const exists=q.name===origin||exact.length>0||hasDescendant;
 const want=TYPE_NAME[qtype];
 const answers=[];
 if(q.name===origin&&(qtype===TYPE.SOA||qtype===255)) answers.push(soa(zone));
 if(q.name===origin&&(qtype===TYPE.NS||qtype===255)&&!exact.some(r=>r.type==="NS")){
   for(const ns of zone.nameservers||[]) answers.push(rr(origin,"NS",{value:ns},zone.default_ttl??300));
 }
 for(const r of exact){
   if(r.type===want||qtype===255) answers.push(rr(q.name,r.type,r,r.ttl??zone.default_ttl??300));
 }
 const authority=answers.length?[]:[soa(zone)];
 const rcode=exists?0:3;
 const responseFlags=0x8400|(flags&0x0100)|rcode; // QR + AA, echo RD, RA remains false
 return Buffer.concat([id,u16(responseFlags),u16(1),u16(answers.length),u16(authority.length),u16(0),question,...answers,...authority]);
}
export function start({snapshotPath,host="0.0.0.0",port=5353}){
 let snap=loadSnapshot(snapshotPath);
 const udp=dgram.createSocket("udp4");
 udp.on("message",(msg,r)=>{const out=answer(msg,snap.zone);if(out)udp.send(out,r.port,r.address)});
 udp.bind(port,host);
 const tcp=net.createServer(sock=>{
  let buf=Buffer.alloc(0);
  sock.on("data",chunk=>{buf=Buffer.concat([buf,chunk]);while(buf.length>=2){const n=buf.readUInt16BE(0);if(buf.length<n+2)break;const out=answer(buf.subarray(2,n+2),snap.zone);if(out)sock.write(Buffer.concat([u16(out.length),out]));buf=buf.subarray(n+2)}});
 });
 tcp.listen(port,host);
 return {udp,tcp,getSnapshot:()=>snap,reload:()=>{snap=loadSnapshot(snapshotPath);return snap}};
}
if(import.meta.url===new URL("file:"+process.argv[1]).href){
 const snapshotPath=process.argv[2];if(!snapshotPath)throw new Error("usage: runtime.mjs <zone.json> [port]");
 const port=Number(process.argv[3]||process.env.PORT||5353);
 const runtime=start({snapshotPath,port});
 console.log(JSON.stringify({state:"listening",port,snapshot:runtime.getSnapshot().hash}));
}
