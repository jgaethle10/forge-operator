import assert from 'node:assert/strict';
import {test} from 'node:test';
import http from 'node:http';
import fs from 'node:fs';
import {startClient001LocalPreview} from '../systemia/evercraft-domains/client001-preview-bridge.mjs';
import {buildLoopbackLabZone} from '../systemia/evercraft-domains/namespace.mjs';
import {createSplitRouter} from '../systemia/evercraft-domains/split-resolver.mjs';

const alias='onthegoquicklube.evercraft';
const registry=JSON.parse(fs.readFileSync(new URL('../systemia/evercraft-domains/registry.json',import.meta.url),'utf8'));
const rawSource=fs.readFileSync(new URL('../public/clients/on-the-go/review/index.html',import.meta.url));
function query(name){
 const h=Buffer.alloc(12);h.writeUInt16BE(0xEC01,0);h.writeUInt16BE(0x0100,2);h.writeUInt16BE(1,4);
 const labels=name.split('.').map(x=>Buffer.concat([Buffer.from([x.length]),Buffer.from(x)]));
 return Buffer.concat([h,...labels,Buffer.from([0,0,1,0,1])]);
}
async function request(port,{path='/',method='GET',host=alias}={}){
 return await new Promise((resolve,reject)=>{
  const req=http.request({
   hostname:'127.0.0.1',port,path,method,headers:{Host:host}
  },res=>{
   const chunks=[];
   res.on('data',x=>chunks.push(x));
   res.on('end',()=>resolve({
    status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)
   }));
  });
  req.on('error',reject);req.end();
 });
}
test('exact Client001 private hostname binds to canonical static HTML on local HTTP only',async()=>{
 const port=18081+(process.pid%3000);
 const site=await startClient001LocalPreview({port});
 try{
  const result=await request(port,{host:alias+':'+port});
  assert.equal(result.status,200);
  assert.deepEqual(result.body,rawSource,'served bytes must match GitHub canonical file');
  assert.match(result.body.toString('utf8',0,10000),/Client Preview V4\.1/);
  assert.match(result.body.toString('utf8'),/onthegomobileoilchange@outlook\.com/);
  assert.match(result.body.toString('utf8'),/tel:\+15098335025/);
  assert.equal(result.headers['x-robots-tag'],'noindex, nofollow, noarchive');
  assert.equal(result.headers['cache-control'],'no-store');
  assert.equal(result.headers['x-frame-options'],'DENY');
  const head=await request(port,{method:'HEAD'});
  assert.equal(head.status,200);
  assert.equal(Number(head.headers['content-length']),rawSource.length);
  assert.equal(head.body.length,0);
  const robots=await request(port,{path:'/robots.txt'});
  assert.equal(robots.body.toString(),'User-agent: *\nDisallow: /\n');
  const health=JSON.parse((await request(port,{path:'/healthz'})).body);
  assert.equal(health.production_tls,false);
  assert.equal(health.public_dns,false);
  assert.equal(health.approved_for_promotion,false);
  for(const wrong of ['localhost','evil.com',alias+'.attacker.com','www.'+alias]){
   assert.equal((await request(port,{host:wrong})).status,421,wrong);
  }
  assert.equal((await request(port,{path:'/../../.git/config'})).status,404);
  assert.equal((await request(port,{path:'/api/private'})).status,404);
  assert.equal((await request(port,{method:'POST'})).status,405);
 }finally{await site.close();}
});
test('synthetic private DNS A answer points only to localhost site, no live browser or TLS claim',async()=>{
 const zone=buildLoopbackLabZone(registry,alias);
 const dns=createSplitRouter({zone});
 const response=await dns(query(alias),'udp');
 assert.equal(response.readUInt16BE(6),1);
 assert.equal(response.subarray(-4).toString('hex'),'7f000001');
 assert.equal(zone.origin,'evercraft.');
 assert.equal(registry.names[0].private_dns_published,false);
 assert.equal(registry.names[0].customer_website_live,false);
 await assert.rejects(
  startClient001LocalPreview({host:'0.0.0.0',port:18081}),
  /loopback/
 );
});
