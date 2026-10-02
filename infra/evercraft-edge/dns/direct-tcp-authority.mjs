#!/usr/bin/env node
import process from 'node:process';
import {parseDigAuthority} from './external-public-verifier.mjs';

const arg=(name,fallback='')=>{
  const i=process.argv.indexOf(name);
  return i>=0&&process.argv[i+1]?process.argv[i+1]:fallback;
};

async function fetchWithTimeout(url,timeoutMs=10000){
  const ctrl=new AbortController();
  const t=setTimeout(()=>ctrl.abort(),timeoutMs);
  try{
    return await fetch(url,{
      headers:{accept:'text/plain','user-agent':'curl/8.0'},
      signal:ctrl.signal
    });
  }finally{clearTimeout(t)}
}

export async function verifyDirectTcpAuthority({
  server,
  identityName,
  expectedTxt='service=evercraft://edge/canary'
}={}){
  const qs=new URLSearchParams({
    name:String(identityName||'').replace(/\.$/,''),
    type:'TXT',
    resolver:'custom',
    transport:'tcp53',
    ip:String(server||''),
    norec:'1',
    dnssec:'0',
    family:'v4'
  });
  const url='https://isitdns.net/api/query?'+qs.toString();
  const res=await fetchWithTimeout(url,10000);
  const text=await res.text();
  const parsed=parseDigAuthority(text,{identityName,expectedTxt});
  return {
    schema:'evercraft.edge.direct-tcp-authority-proof.v1',
    verified:res.ok&&parsed.verified===true,
    transport:'tcp53',
    recursion_desired:false,
    source_surface:'isitdns-api-query-custom-ip',
    http_status:res.status,
    parsed,
    evidence_excerpt:text.slice(0,4000),
    candidate_ip_persisted_in_repo:false,
    observed_at:new Date().toISOString()
  };
}

if(process.argv[1]&&import.meta.url===new URL('file:'+process.argv[1]).href){
  const server=arg('--server');
  const identityName=arg('--name');
  const expectedTxt=arg('--expected-txt','service=evercraft://edge/canary');
  if(!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(server)) throw new Error('--server IPv4 required');
  if(!identityName) throw new Error('--name required');
  const receipt=await verifyDirectTcpAuthority({server,identityName,expectedTxt});
  console.log(JSON.stringify(receipt,null,2));
  if(!receipt.verified) process.exitCode=2;
}
