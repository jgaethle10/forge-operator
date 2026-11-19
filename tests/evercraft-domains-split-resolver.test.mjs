import assert from 'node:assert/strict';
import {test} from 'node:test';
import dgram from 'node:dgram';
import net from 'node:net';
import fs from 'node:fs';
import {buildLoopbackLabZone} from '../systemia/evercraft-domains/namespace.mjs';
import {createSplitRouter,startSplitResolver} from '../systemia/evercraft-domains/split-resolver.mjs';

const registry=JSON.parse(fs.readFileSync(new URL('../systemia/evercraft-domains/registry.json',import.meta.url),'utf8'));
const zone=buildLoopbackLabZone(registry,'onthegoquicklube.evercraft');
function question(name,id=0x4E01,type=1){
 const header=Buffer.alloc(12);
 header.writeUInt16BE(id,0);
 header.writeUInt16BE(0x0100,2);
 header.writeUInt16BE(1,4);
 const labels=name.replace(/\.$/,'').split('.').map(x=>Buffer.concat([Buffer.from([x.length]),Buffer.from(x)]));
 return Buffer.concat([header,...labels,Buffer.from([0,0,type,0,1])]);
}
function inspect(b){
 return {id:b.readUInt16BE(0),
  aa:!!(b.readUInt16BE(2)&0x0400),
  ra:!!(b.readUInt16BE(2)&0x0080),
  rcode:b.readUInt16BE(2)&15,
  questions:b.readUInt16BE(4),answers:b.readUInt16BE(6),
  data:b.subarray(-4).toString('hex')};
}
function fakePublicResponse(query){
 const h=Buffer.alloc(12);
 query.copy(h,0,0,2);
 h.writeUInt16BE(0x8180,2);h.writeUInt16BE(1,4);h.writeUInt16BE(1,6);
 const rr=Buffer.from([0xc0,0x0c,0,1,0,1,0,0,0,30,0,4,192,0,2,44]);
 return Buffer.concat([h,query.subarray(12),rr]);
}
async function udpRequest(port,packet){
 return await new Promise((resolve,reject)=>{
  const s=dgram.createSocket('udp4');
  let done=false;
  function finish(err,result){
   if(done)return;done=true;clearTimeout(timer);s.close();
   err?reject(err):resolve(result);
  }
  const timer=setTimeout(()=>finish(Error('udp_timeout')),2500);
  s.on('error',e=>finish(e));
  s.on('message',msg=>finish(null,msg));
  s.send(packet,port,'127.0.0.1',err=>{if(err)finish(err);});
 });
}
async function tcpRequest(port,packet){
 return await new Promise((resolve,reject)=>{
  const s=net.createConnection({host:'127.0.0.1',port});
  let data=Buffer.alloc(0),done=false;
  function finish(err,result){if(done)return;done=true;s.destroy();err?reject(err):resolve(result);}
  s.setTimeout(2500,()=>finish(Error('tcp_timeout')));
  s.on('error',e=>finish(e));
  s.on('connect',()=>{
   const h=Buffer.alloc(2);h.writeUInt16BE(packet.length);
   s.write(Buffer.concat([h,packet]));
  });
  s.on('data',chunk=>{
   data=Buffer.concat([data,chunk]);
   if(data.length>=2&&data.length>=data.readUInt16BE(0)+2)
    finish(null,data.subarray(2,data.readUInt16BE(0)+2));
  });
 });
}
test('exact private .evercraft route and unrelated DNS are separated',async()=>{
 const route=createSplitRouter({zone});
 const name=question('onthegoquicklube.evercraft');
 const privateReply=inspect(await route(name));
 assert.equal(privateReply.aa,true);
 assert.equal(privateReply.ra,false);
 assert.equal(privateReply.rcode,0);
 assert.equal(privateReply.answers,1);
 assert.equal(privateReply.data,'7f000001');
 const unknown=inspect(await route(question('not-registered.evercraft')));
 assert.equal(unknown.aa,true);assert.equal(unknown.rcode,3);
 // Upstream is not configured: ordinary DNS fails safely.
 for(const n of ['example.org','onthegoquicklube.evercraft.com','hello.notevercraft']){
  const reply=inspect(await route(question(n)));
  assert.equal(reply.aa,false);assert.equal(reply.rcode,2);
 }
});
test('malformed, unexpected and unsafe lab configurations fail closed',async()=>{
 assert.throws(()=>createSplitRouter({zone,upstream:{host:'8.8.8.8',port:53}}),/loopback/);
 assert.throws(()=>createSplitRouter({zone:{...zone,records:[{name:'test',type:'A',value:'192.0.2.3'}]}}),/loopback_only/);
 await assert.rejects(startSplitResolver({zone,host:'0.0.0.0',port:15453}),/loopback/);
 await assert.rejects(startSplitResolver({zone,port:15453,upstream:{host:'127.0.0.1',port:15453}}),/upstream_loop/);
 const route=createSplitRouter({zone});
 const bad=question('example.org');bad[12]=0xc0;bad[13]=0x0c;
 assert.equal(inspect(await route(bad)).rcode,1);
 const truncated=Buffer.from([0,1,1,0]);
 assert.equal(inspect(await route(truncated)).rcode,1);
});
test('actual loopback sockets split .evercraft from explicitly local public upstream, UDP and TCP',async()=>{
 // Both "external" DNS and our resolver are local only, with mock public answers.
 let publicUdp=0,publicTcp=0;
 const upstreamTcp=net.createServer(sock=>{
  let data=Buffer.alloc(0);
  sock.on('data',chunk=>{
   data=Buffer.concat([data,chunk]);
   if(data.length<2)return;
   const n=data.readUInt16BE(0);
   if(data.length<n+2)return;
   publicTcp++;
   const reply=fakePublicResponse(data.subarray(2,n+2));
   const h=Buffer.alloc(2);h.writeUInt16BE(reply.length);
   sock.end(Buffer.concat([h,reply]));
  });
 });
 await new Promise(resolve=>upstreamTcp.listen(0,'127.0.0.1',resolve));
 const upstreamPort=upstreamTcp.address().port;
 const upstreamUdp=dgram.createSocket('udp4');
 upstreamUdp.on('message',(q,peer)=>{
  publicUdp++;
  upstreamUdp.send(fakePublicResponse(q),peer.port,peer.address);
 });
 await new Promise(resolve=>upstreamUdp.bind(upstreamPort,'127.0.0.1',resolve));
 // Separate unprivileged test port. Never touch port 53 or host DNS configuration.
 const splitPort=35000+(process.pid%15000);
 let server;
 try{
  server=await startSplitResolver({
   zone,host:'127.0.0.1',port:splitPort,
   upstream:{host:'127.0.0.1',port:upstreamPort}
  });
  const privateReq=question('onthegoquicklube.evercraft');
  const pubReq=question('example.org',0x4E02);
  for(const [mode,ask] of [['udp',udpRequest],['tcp',tcpRequest]]){
   const a=inspect(await ask(splitPort,privateReq));
   assert.equal(a.aa,true,mode);assert.equal(a.answers,1,mode);
   assert.equal(a.data,'7f000001',mode);
   const b=inspect(await ask(splitPort,pubReq));
   assert.equal(b.aa,false,mode);assert.equal(b.ra,true,mode);
   assert.equal(b.answers,1,mode);
   assert.equal(b.data,'c000022c',mode);
   const miss=inspect(await ask(splitPort,question('unknown.evercraft',0x4E03)));
   assert.equal(miss.aa,true,mode);assert.equal(miss.rcode,3,mode);
  }
  assert.equal(publicUdp,1,'private and NXDOMAIN never forwarded to public UDP');
  assert.equal(publicTcp,1,'private and NXDOMAIN never forwarded to public TCP');
 }finally{
  if(server)await server.close();
  await new Promise(resolve=>upstreamTcp.close(resolve));
  await new Promise(resolve=>upstreamUdp.close(resolve));
 }
});
