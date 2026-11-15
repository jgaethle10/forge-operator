// Per-client Worlds creation admission. Only a dedicated owned edge may stamp the
// canonical address; arbitrary Internet X-Forwarded-For values are NOT trusted.
import {isIP} from 'node:net';
export const CREATION_WINDOW_MS=600000;
export const CREATIONS_PER_CLIENT=10;
export const MAX_TRACKED_CLIENTS=4096;
const isLoopback=address=>['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address);
export function worldsClientAddress(request,pinnedOrigin=''){
 const peer=String(request?.socket?.remoteAddress||'unknown');
 const forwarded=request?.headers?.['x-worlds-client-ip'];
 // Only a loopback vault paired to a pinned HTTPS origin accepts the canonical
 // edge-stamped address. The edge MUST replace any client-supplied value.
 if(pinnedOrigin&&isLoopback(peer)&&typeof forwarded==='string'&&forwarded.length<=45&&isIP(forwarded)){
  return forwarded.toLowerCase();
 }
 return peer.toLowerCase();
}
export function createWorldsAdmission({limit=CREATIONS_PER_CLIENT,windowMs=CREATION_WINDOW_MS,maxClients=MAX_TRACKED_CLIENTS,clock=Date.now}={}){
 if(!Number.isInteger(limit)||limit<1||!Number.isInteger(windowMs)||windowMs<1||
 !Number.isInteger(maxClients)||maxClients<1)throw Error('worlds_admission_config_invalid');
 const windows=new Map();
 const sweep=now=>{for(const [key,times] of windows){
  const fresh=times.filter(t=>now-t<windowMs);
  if(fresh.length)windows.set(key,fresh);else windows.delete(key);
 }};
 return {
  admit(request,pinnedOrigin=''){
   const client=worldsClientAddress(request,pinnedOrigin);
   const now=clock();
   const times=(windows.get(client)||[]).filter(t=>now-t<windowMs);
   if(!windows.has(client)&&windows.size>=maxClients)sweep(now);
   if(!windows.has(client)&&windows.size>=maxClients)return {allowed:false,reason:'client_limit_capacity'};
   if(times.length>=limit){windows.set(client,times);return {allowed:false,reason:'client_creation_rate_limited'};}
   times.push(now);windows.set(client,times);
   return {allowed:true,remaining:limit-times.length};
  },
  get trackedClients(){return windows.size;}
 };
}
