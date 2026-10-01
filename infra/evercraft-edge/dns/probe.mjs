#!/usr/bin/env node
import dgram from "node:dgram";
import net from "node:net";

function encodeName(name){return Buffer.concat([...name.replace(/\.$/,"").split(".").map(x=>Buffer.concat([Buffer.from([x.length]),Buffer.from(x)])),Buffer.from([0])])}
function query(name,type=16){const h=Buffer.alloc(12);h.writeUInt16BE(0x4556,0);h.writeUInt16BE(0x0100,2);h.writeUInt16BE(1,4);return Buffer.concat([h,encodeName(name),Buffer.from([0,type,0,1])])}
function inspect(buf){const flags=buf.readUInt16BE(2);return {rcode:flags&15,aa:Boolean(flags&0x0400),ra:Boolean(flags&0x0080),answers:buf.readUInt16BE(6),authority:buf.readUInt16BE(8)}}
export async function probeUdp({server,port=53,name,timeout=3000}){return await new Promise((resolve,reject)=>{const s=dgram.createSocket("udp4"),q=query(name),t=setTimeout(()=>{s.close();reject(new Error("udp_timeout"))},timeout);s.once("message",m=>{clearTimeout(t);s.close();resolve(inspect(m))});s.send(q,port,server)})}
export async function probeTcp({server,port=53,name,timeout=3000}){return await new Promise((resolve,reject)=>{const s=net.connect(port,server),q=query(name),frame=Buffer.alloc(q.length+2);frame.writeUInt16BE(q.length,0);q.copy(frame,2);let buf=Buffer.alloc(0);const t=setTimeout(()=>{s.destroy();reject(new Error("tcp_timeout"))},timeout);s.on("connect",()=>s.write(frame));s.on("data",c=>{buf=Buffer.concat([buf,c]);if(buf.length>=2&&buf.length>=buf.readUInt16BE(0)+2){clearTimeout(t);s.destroy();resolve(inspect(buf.subarray(2,buf.readUInt16BE(0)+2)))}})})}
