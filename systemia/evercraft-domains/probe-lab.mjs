#!/usr/bin/env node
// Real UDP/TCP wire probe of the LOOPBACK-ONLY Evercraft Domains lab.
// Read-only; makes no public DNS requests, changes or network configuration.
import dgram from 'node:dgram';
import net from 'node:net';

const hostname='onthegoquicklube.evercraft';
const host='127.0.0.1',port=Number(process.argv[2]||15353);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('invalid_lab_port');
const packet=(()=>{
 const h=Buffer.alloc(12);
 h.writeUInt16BE(0xEC01,0);h.writeUInt16BE(0x0100,2);h.writeUInt16BE(1,4);
 const labels=hostname.split('.').map(x=>Buffer.concat([Buffer.from([x.length]),Buffer.from(x)]));
 return Buffer.concat([h,...labels,Buffer.from([0,0,1,0,1])]);
})();
function inspect(reply,transport){
 if(reply.length<12)throw Error(transport+'_short_dns_reply');
 const flags=reply.readUInt16BE(2);
 const parsed={transport,transaction_id:reply.readUInt16BE(0),
  authoritative:Boolean(flags&0x0400),recursion_available:Boolean(flags&0x0080),
  rcode:flags&15,answer_count:reply.readUInt16BE(6)};
 if(parsed.transaction_id!==0xEC01||!parsed.authoritative||parsed.recursion_available||
    parsed.rcode!==0||parsed.answer_count!==1)throw Error(transport+'_unexpected_dns_reply:'+JSON.stringify(parsed));
 return parsed;
}
async function udp(){
 const socket=dgram.createSocket('udp4');
 return await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{socket.close();reject(Error('udp_timeout'));},2500);
  socket.on('error',err=>{clearTimeout(timer);socket.close();reject(err);});
  socket.on('message',msg=>{clearTimeout(timer);socket.close();resolve(inspect(msg,'udp'));});
  socket.send(packet,port,host,err=>{if(err){clearTimeout(timer);socket.close();reject(err);}});
 });
}
async function tcp(){
 return await new Promise((resolve,reject)=>{
  const socket=net.createConnection({host,port});
  let received=Buffer.alloc(0),settled=false;
  const done=(error,value)=>{if(settled)return;settled=true;socket.destroy();error?reject(error):resolve(value);};
  socket.setTimeout(2500,()=>done(Error('tcp_timeout')));
  socket.on('error',err=>done(err));
  socket.on('connect',()=>{
   const header=Buffer.alloc(2);header.writeUInt16BE(packet.length);
   socket.write(Buffer.concat([header,packet]));
  });
  socket.on('data',chunk=>{
   received=Buffer.concat([received,chunk]);
   if(received.length<2)return;
   const count=received.readUInt16BE(0);
   if(received.length>=count+2){
    try{done(null,inspect(received.subarray(2,count+2),'tcp'));}
    catch(error){done(error);}
   }
  });
 });
}
const result=await Promise.all([udp(),tcp()]);
console.log(JSON.stringify({schema:'evercraft.domains.loopback-wire-proof.v1',
 scope:'loopback_only',hostname,udp_tcp_authoritative:true,
 public_tld:false,site_live:false,records:result},null,2));
