#!/usr/bin/env node
import http from 'node:http';
import { handleRequest } from './worker.mjs';

// Portable origin adapter for Evercraft Yard / NodeSeed with Caddy TLS termination.
// Strictly loopback by default. No public HTTP listener, database or legacy proxy.
const host=process.env.FRONTDOOR_LISTEN_HOST||'127.0.0.1';
const port=Number(process.env.FRONTDOOR_PORT||3080);
if(host!=='127.0.0.1'&&host!=='::1')throw new Error('frontdoor_must_bind_loopback');
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('invalid_frontdoor_port');

const server=http.createServer(async (incoming,outgoing)=>{
  try{
    const headerHost=String(incoming.headers.host||'');
    const target=incoming.url||'';
    if(!/^\/[\s\S]*$/.test(target)||target.startsWith('//')||!headerHost||/[\s\/]/.test(headerHost)){
      outgoing.writeHead(400,{'content-type':'text/plain'});outgoing.end('Bad request');return;
    }
    const path=new URL(target,'https://'+headerHost);
    const request=new Request(path,{method:incoming.method});
    const response=await handleRequest(request);
    outgoing.writeHead(response.status,Object.fromEntries(response.headers));
    if(incoming.method==='HEAD'||!response.body){outgoing.end();return;}
    const bytes=Buffer.from(await response.arrayBuffer());
    outgoing.end(bytes);
  }catch{
    outgoing.writeHead(500,{'content-type':'text/plain','cache-control':'no-store'});
    outgoing.end('Site temporarily unavailable');
  }
});
server.listen(port,host,()=>console.log('Evercraft static front door listening on loopback port '+port));
