import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import crypto from 'node:crypto';
import {startLocalRadioPortal,verifyLocalRadioPackage} from './community-radio-offline-portal.mjs';

// Opt-in, short-lived LAN lab for SYNTHETIC recordings only. Never connects FM,
// EAS, station hardware, or real station streams. Plain HTTP is not secure for
// sensitive data: this demo intentionally carries no real-world content.
const reject=(s)=>{throw new Error(s);};
const privateIp=(ip)=>{
  if(net.isIP(ip)!==4)return false;
  const v=ip.split('.').map(Number);
  return v[0]===10||(v[0]===172&&v[1]>=16&&v[1]<=31)||
    (v[0]===192&&v[1]===168);
};
export function authorizeCommunityRadioLanLab({host,operatorAcknowledged=false,
  interfaces=os.networkInterfaces(),minutes=10}={}){
  if(operatorAcknowledged!==true)reject('explicit_operator_lab_acknowledgment_required');
  if(typeof host!=='string'||!privateIp(host))reject('explicit_private_ipv4_required');
  if(!Number.isInteger(minutes)||minutes<1||minutes>15)reject('lab_duration_must_be_1_to_15_minutes');
  const assigned=Object.values(interfaces||{}).flatMap(x=>Array.isArray(x)?x:[])
    .some(x=>x&&x.address===host&&x.family==='IPv4'&&x.internal===false);
  if(!assigned)reject('host_must_be_nonloopback_local_interface');
  return {host,minutes,maxSeconds:minutes*60,synthetic_only:true,public_bind:false};
}
function verifiedSynthetic({dir,publicKey,now}){
  const verified=verifyLocalRadioPackage({dir,publicKey,now});
  const raw=JSON.parse(fs.readFileSync(path.join(fs.realpathSync(dir),'bulletin.json'),'utf8'));
  if(raw?.signed_data?.lab_synthetic_fixture!==true||
    !String(verified.station).includes('Simulated')||
    !String(verified.title).toLowerCase().includes('simulation'))
    reject('signed_synthetic_lab_material_only');
  return verified;
}
export async function startCommunityRadioLanLab({dir,publicKey,host,operatorAcknowledged=false,
  minutes=10,interfaces=os.networkInterfaces(),now=()=>new Date()}={}){
  authorizeCommunityRadioLanLab({host,operatorAcknowledged,interfaces,minutes});
  verifiedSynthetic({dir,publicKey,now:now()});
  const upstream=await startLocalRadioPortal({dir,publicKey,now});
  const token=crypto.randomBytes(32).toString('hex');
  const expires=Date.now()+minutes*60000;
  let closed=false;
  const finish=(res,status,body='')=>{
    res.writeHead(status,{'content-type':'text/plain; charset=utf-8','cache-control':'no-store',
      'x-content-type-options':'nosniff','referrer-policy':'no-referrer'});
    res.end(body);
  };
  const server=http.createServer(async(req,res)=>{
    if(Date.now()>=expires){finish(res,410,'Synthetic LAN trial expired');return;}
    if(!['GET','HEAD'].includes(req.method)){finish(res,405,'Read-only synthetic test');return;}
    if(req.url==='/join/'+token){
      res.writeHead(303,{'location':'/','set-cookie':'evercraft_lab='+token+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+Math.max(1,Math.ceil((expires-Date.now())/1000)),
        'cache-control':'no-store','referrer-policy':'no-referrer'});
      res.end();return;
    }
    const matched=String(req.headers.cookie||'').match(/(?:^|;\s*)evercraft_lab=([a-f0-9]{64})(?:;|$)/);
    if(!matched||!crypto.timingSafeEqual(Buffer.from(matched[1],'hex'),Buffer.from(token,'hex'))){
      finish(res,403,'Private synthetic lab: open the operator-provided join link');return;
    }
    if(!['/','/audio'].includes(req.url)){finish(res,404,'Unknown local lab route');return;}
    try{
      verifiedSynthetic({dir,publicKey,now:now()});
      const dest=new URL(req.url,upstream.origin);
      const upstreamResponse=await fetch(dest,{method:req.method,
        headers:req.headers.range?{range:req.headers.range}:{}});
      const responseHeaders={...Object.fromEntries(
        ['content-type','content-length','content-range','accept-ranges','cache-control',
          'x-content-type-options','content-security-policy','x-frame-options','referrer-policy']
        .filter(k=>upstreamResponse.headers.has(k)).map(k=>[k,upstreamResponse.headers.get(k)])),
        'cache-control':'no-store','referrer-policy':'no-referrer'};
      const bytes=Buffer.from(await upstreamResponse.arrayBuffer());
      res.writeHead(upstreamResponse.status,responseHeaders);
      res.end(req.method==='HEAD'?undefined:bytes);
    }catch{finish(res,503,'Synthetic bulletin unavailable: expiry, signature, or integrity gate');}
  });
  try{
    await new Promise((resolve,rej)=>{server.once('error',rej);
      server.listen(0,host,()=>{server.off('error',rej);resolve();});});
  }catch(err){upstream.server.close();throw err;}
  const stop=()=>new Promise(resolve=>{
    if(closed){resolve();return;}closed=true;
    server.close(()=>upstream.server.close(()=>resolve()));
    server.closeAllConnections?.();
  });
  const timer=setTimeout(()=>{void stop();},Math.max(1000,expires-Date.now()));
  timer.unref?.();
  return {server,upstream_server:upstream.server,host,
    origin:'http://'+host+':'+server.address().port,
    join_url:'http://'+host+':'+server.address().port+'/join/'+token,
    expires_at:new Date(expires).toISOString(),stop:async()=>{clearTimeout(timer);await stop();},
    note:'Synthetic LAN test only; HTTP without encryption; do not use with real station data or untrusted networks.'};
}
