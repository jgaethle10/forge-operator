#!/usr/bin/env node
/**
 * Client 001 local site binding proof.
 * No production deployment, HTTPS, public listener or system DNS changes.
 * Serve the canonical On The Go static HTML under the exact private alias
 * using a local-only, unprivileged HTTP port for operator QA.
 */
import http from 'node:http';
import fs from 'node:fs';
import {normalizePrivateAlias,enforceLabBind,planAlias} from './namespace.mjs';

const registry=JSON.parse(fs.readFileSync(new URL('./registry.json',import.meta.url),'utf8'));
const htmlPath=new URL('../../public/clients/on-the-go/review/index.html',import.meta.url);
const EXPECTED_ALIAS='onthegoquicklube.evercraft';
function normalizedHost(value,port){
 const raw=String(value||'').toLowerCase();
 if(raw===EXPECTED_ALIAS||raw===EXPECTED_ALIAS+':'+port)return EXPECTED_ALIAS;
 return null;
}
export async function startClient001LocalPreview({host='127.0.0.1',port=18081}={}){
 enforceLabBind(host,port);
 const plan=planAlias(registry,normalizePrivateAlias(EXPECTED_ALIAS));
 if(plan.private_record_published!==false||plan.customer_promotion_authorized!==false)
  throw new Error('client001_publication_hold_required');
 // Do not permit any supplied root path or editable public content.
 const html=fs.readFileSync(htmlPath);
 if(!html.toString('utf8',0,1024*20).includes('Client Preview V4.1'))
  throw new Error('client001_exact_preview_version_not_proven');
 const server=http.createServer((req,res)=>{
  const allowed=normalizedHost(req.headers.host,port);
  const headers={
   'X-Content-Type-Options':'nosniff',
   'X-Frame-Options':'DENY',
   'X-Robots-Tag':'noindex, nofollow, noarchive',
   'Referrer-Policy':'no-referrer',
   'Cache-Control':'no-store'
  };
  for(const [key,value] of Object.entries(headers))res.setHeader(key,value);
  if(!allowed){res.writeHead(421);res.end();return;}
  if(req.method!=='GET'&&req.method!=='HEAD'){
   res.writeHead(405,{'Allow':'GET, HEAD'});res.end();return;
  }
  const url=new URL(req.url||'/', 'http://'+EXPECTED_ALIAS);
  if(url.pathname==='/healthz'){
   const body=Buffer.from(JSON.stringify({
    schema:'evercraft.domains.client001.local-preview-health.v1',
    state:'LOOPBACK_ONLY_REVIEW',
    alias:EXPECTED_ALIAS,
    approved_for_promotion:false,
    production_tls:false,
    public_dns:false,
    customer_site_live:false
   }));
   res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Content-Length':body.length});
   res.end(req.method==='HEAD'?undefined:body);return;
  }
  if(url.pathname==='/robots.txt'){
   const body=Buffer.from('User-agent: *\nDisallow: /\n');
   res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Content-Length':body.length});
   res.end(req.method==='HEAD'?undefined:body);return;
  }
  if(url.pathname!=='/'&&url.pathname!=='/index.html'){
   res.writeHead(404);res.end();return;
  }
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Length':html.length});
  res.end(req.method==='HEAD'?undefined:html);
 });
 await new Promise((resolve,reject)=>{
  server.once('error',reject);
  server.listen(port,host,()=>{server.off('error',reject);resolve();});
 });
 return {
  state:'LOOPBACK_ONLY_REVIEW',
  host,port,alias:EXPECTED_ALIAS,server,
  close:()=>new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()))
 };
}
if(process.argv[1]&&import.meta.url===new URL('file:'+process.argv[1]).href){
 const i=process.argv.indexOf('--port');
 const port=i<0?18081:Number(process.argv[i+1]);
 const service=await startClient001LocalPreview({port});
 console.log(JSON.stringify({
  state:service.state,
  alias:service.alias,
  host:service.host,port:service.port,
  public_route:false,
  tls_proven:false,
  browser_ready_on_devices:false,
  note:'Test with curl -H Host:onthegoquicklube.evercraft http://127.0.0.1:'+service.port+'/'
 },null,2));
 for(const sig of ['SIGINT','SIGTERM'])process.once(sig,async()=>{
  await service.close();process.exit(0);
 });
}
