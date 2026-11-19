/**
 * Evercraft Domains: explicit, localhost-only DNS split resolver.
 * Private .evercraft names use the existing authoritative DNS engine.
 * Other names are forwarded ONLY to an explicitly configured loopback
 * upstream. No system DNS, router, registrar, remote host or TLS changes.
 */
import dgram from 'node:dgram';
import net from 'node:net';
import {answer} from '../../infra/evercraft-edge/dns/runtime.mjs';
import {enforceLabBind} from './namespace.mjs';

const MAX_DNS=4096;
const MAX_TCP_BUFFER=8194;
const PRIVATE_ZONE='evercraft.';
const UPSTREAM_TIMEOUT_MS=1800;

function readQuestion(packet){
 if(!Buffer.isBuffer(packet)||packet.length<17||packet.length>MAX_DNS)
  throw new Error('dns_packet_size_invalid');
 const flags=packet.readUInt16BE(2);
 if((flags&0x8000)!==0||(flags&0x7800)!==0||packet.readUInt16BE(4)!==1)
  throw new Error('not_single_standard_dns_query');
 let pos=12;
 const labels=[];
 let total=0;
 while(true){
  if(pos>=packet.length)throw new Error('dns_qname_truncated');
  const n=packet[pos++];
  if(n===0)break;
  if(n>63 || (n&0xc0)!==0)throw new Error('compressed_or_invalid_qname');
  if(n===0||pos+n>packet.length)throw new Error('dns_label_truncated');
  const label=packet.subarray(pos,pos+n).toString('ascii').toLowerCase();
  if(!/^[a-z0-9_-]+$/.test(label))throw new Error('dns_label_untrusted');
  total+=n+1;
  if(total>254)throw new Error('dns_name_too_long');
  labels.push(label);
  pos+=n;
 }
 if(pos+4!==packet.length)throw new Error('dns_question_trailing_bytes');
 const type=packet.readUInt16BE(pos),cls=packet.readUInt16BE(pos+2);
 if(cls!==1)throw new Error('only_in_dns_class_supported');
 return {name:labels.join('.')+'.',type,cls,question:packet.subarray(12,pos+4)};
}
function isPrivate(name){return name===PRIVATE_ZONE||name.endsWith('.'+PRIVATE_ZONE);}
function errorReply(packet,rcode,question){
 const p=Buffer.alloc(12);
 if(Buffer.isBuffer(packet)&&packet.length>=2)packet.copy(p,0,0,2);
 p.writeUInt16BE(0x8000 | ((packet?.length>=4?packet.readUInt16BE(2):0)&0x0100) | rcode,2);
 if(question){p.writeUInt16BE(1,4);return Buffer.concat([p,question]);}
 return p;
}
function assertUpstream(spec){
 if(spec===null||spec===undefined)return null;
 if(typeof spec!=='object'||spec.host!=='127.0.0.1'||
    !Number.isInteger(spec.port)||spec.port<1024||spec.port>65535)
  throw new Error('split_upstream_must_be_explicit_ipv4_loopback_unprivileged');
 return {host:spec.host,port:spec.port};
}
function validateUpstreamReply(query,reply){
 if(!Buffer.isBuffer(reply)||reply.length<12||reply.length>MAX_DNS)
  throw new Error('upstream_response_invalid_size');
 if(reply.readUInt16BE(0)!==query.readUInt16BE(0)||
    (reply.readUInt16BE(2)&0x8000)===0)
  throw new Error('upstream_transaction_mismatch');
 const expected=readQuestion(query);
 // DNS upstreams can compress names inside answers, not the question itself.
 const got=readQuestionForResponse(reply);
 if(!got || got.name!==expected.name||got.type!==expected.type||got.cls!==expected.cls)
  throw new Error('upstream_question_mismatch');
 return reply;
}
function readQuestionForResponse(reply){
 try{
  if(reply.readUInt16BE(4)!==1)return null;
  // Parse only the first question, ignoring any response RRs.
  let off=12;
  const labels=[];
  while(true){
   if(off>=reply.length)return null;
   const n=reply[off++];
   if(n===0)break;
   if(n>63||n&0xc0||off+n>reply.length)return null;
   const label=reply.subarray(off,off+n).toString('ascii').toLowerCase();
   if(!/^[a-z0-9_-]+$/.test(label))return null;
   labels.push(label);off+=n;
  }
  if(off+4>reply.length)return null;
  return {name:labels.join('.')+'.',type:reply.readUInt16BE(off),cls:reply.readUInt16BE(off+2)};
 }catch{return null;}
}
function forwardUdp(query,upstream){
 return new Promise((resolve,reject)=>{
  const socket=dgram.createSocket('udp4');
  let finished=false;
  const finish=(err,result)=>{
   if(finished)return;finished=true;clearTimeout(timer);
   try{socket.close();}catch{}
   err?reject(err):resolve(result);
  };
  const timer=setTimeout(()=>finish(Error('upstream_udp_timeout')),UPSTREAM_TIMEOUT_MS);
  socket.on('error',e=>finish(e));
  socket.on('message',(reply,peer)=>{
   if(peer.address!==upstream.host||peer.port!==upstream.port)return;
   try{finish(null,validateUpstreamReply(query,reply));}catch(e){finish(e);}
  });
  socket.send(query,upstream.port,upstream.host,err=>{if(err)finish(err);});
 });
}
function forwardTcp(query,upstream){
 return new Promise((resolve,reject)=>{
  const socket=net.createConnection(upstream);
  let data=Buffer.alloc(0),done=false;
  const finish=(err,result)=>{
   if(done)return;done=true;socket.destroy();
   err?reject(err):resolve(result);
  };
  socket.setTimeout(UPSTREAM_TIMEOUT_MS,()=>finish(Error('upstream_tcp_timeout')));
  socket.on('error',e=>finish(e));
  socket.on('connect',()=>{
   const hdr=Buffer.alloc(2);hdr.writeUInt16BE(query.length);
   socket.write(Buffer.concat([hdr,query]));
  });
  socket.on('data',chunk=>{
   data=Buffer.concat([data,chunk]);
   if(data.length>MAX_TCP_BUFFER)return finish(Error('upstream_tcp_response_too_large'));
   if(data.length<2)return;
   const n=data.readUInt16BE(0);
   if(!n||n>MAX_DNS)return finish(Error('upstream_tcp_length_invalid'));
   if(data.length>=n+2){
    try{finish(null,validateUpstreamReply(query,data.subarray(2,n+2)));}
    catch(e){finish(e);}
   }
  });
  socket.on('end',()=>finish(Error('upstream_tcp_closed')));
 });
}
export function createSplitRouter({zone,upstream=null}={}){
 if(zone?.origin!==PRIVATE_ZONE||!Array.isArray(zone.records))
  throw new Error('exact_private_zone_required');
 if(zone.records.some(r=>r.type==='A'&&r.value!=='127.0.0.1'))
  throw new Error('lab_zone_must_remain_loopback_only');
 const approved=assertUpstream(upstream);
 return async function route(packet,transport='udp'){
  let q;
  try{q=readQuestion(packet);}catch{
   return errorReply(packet,1);
  }
  if(isPrivate(q.name)){
   try{return answer(packet,zone)||errorReply(packet,2,q.question);}
   catch{return errorReply(packet,2,q.question);}
  }
  if(!approved)return errorReply(packet,2,q.question);
  try{
   return transport==='tcp'
    ?await forwardTcp(packet,approved)
    :await forwardUdp(packet,approved);
  }catch{
   return errorReply(packet,2,q.question);
  }
 };
}
export async function startSplitResolver({zone,host='127.0.0.1',port=15453,upstream=null}={}){
 enforceLabBind(host,port);
 if(upstream?.port===port&&upstream?.host===host)
  throw new Error('upstream_loop_not_allowed');
 const route=createSplitRouter({zone,upstream});
 const udp=dgram.createSocket('udp4');
 udp.on('message',(packet,peer)=>{
  route(packet,'udp').then(reply=>udp.send(reply,peer.port,peer.address)).catch(()=>{});
 });
 await new Promise((resolve,reject)=>{
  udp.once('error',reject);
  udp.bind(port,host,()=>{udp.off('error',reject);resolve();});
 });
 const tcp=net.createServer(sock=>{
  let data=Buffer.alloc(0);
  let chain=Promise.resolve();
  sock.setTimeout(8000,()=>sock.destroy());
  sock.on('data',chunk=>{
   data=Buffer.concat([data,chunk]);
   if(data.length>MAX_TCP_BUFFER){sock.destroy();return;}
   while(data.length>=2){
    const n=data.readUInt16BE(0);
    if(!n||n>MAX_DNS){sock.destroy();return;}
    if(data.length<n+2)break;
    const packet=Buffer.from(data.subarray(2,n+2));
    data=data.subarray(n+2);
    chain=chain.then(async()=>{
     if(sock.destroyed)return;
     const reply=await route(packet,'tcp');
     if(!sock.destroyed){
      const hdr=Buffer.alloc(2);hdr.writeUInt16BE(reply.length);
      sock.write(Buffer.concat([hdr,reply]));
     }
    }).catch(()=>sock.destroy());
   }
  });
 });
 try{
  await new Promise((resolve,reject)=>{
   tcp.once('error',reject);
   tcp.listen(port,host,()=>{tcp.off('error',reject);resolve();});
  });
 }catch(e){udp.close();throw e;}
 const close=async()=>{await Promise.all([
  new Promise(resolve=>udp.close(()=>resolve())),
  new Promise(resolve=>tcp.close(()=>resolve()))
 ]);};
 return {host,port,upstream:upstream?{host:upstream.host,port:upstream.port}:null,
  scope:'loopback_split_dns_lab',udp,tcp,route,close};
}
