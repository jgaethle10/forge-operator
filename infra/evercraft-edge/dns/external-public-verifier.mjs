#!/usr/bin/env node
import process from 'node:process';
import fs from 'node:fs';
import {randomInt} from 'node:crypto';

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const arg=(name,fallback='')=>{
  const i=process.argv.indexOf(name);
  return i>=0&&process.argv[i+1]?process.argv[i+1]:fallback;
};

export function dnsTxtQueryHex(name,transactionId=0x4556){
  const clean=String(name).replace(/\.$/,'');
  const labels=clean.split('.').filter(Boolean);
  const qname=Buffer.concat([
    ...labels.map(label=>{
      const b=Buffer.from(label,'utf8');
      if(b.length>63) throw new Error('dns_label_too_long');
      return Buffer.concat([Buffer.from([b.length]),b]);
    }),
    Buffer.from([0])
  ]);
  const h=Buffer.alloc(12);
  h.writeUInt16BE(Number(transactionId)&0xffff,0);
  h.writeUInt16BE(0x0000,2); // RD=0 authoritative query
  h.writeUInt16BE(1,4);
  return '0x'+Buffer.concat([h,qname,Buffer.from([0,16,0,1])]).toString('hex');
}

export function parseDigAuthority(text,{identityName,expectedTxt}={}){
  const raw=String(text||'');
  const flagsLine=raw.split(/\r?\n/).find(l=>l.includes(';; flags:'))||'';
  const m=flagsLine.match(/;; flags:\s*([^;]+);/i);
  const flags=new Set((m?.[1]||'').trim().split(/\s+/).filter(Boolean));
  const normalizedIdentity=String(identityName||'').replace(/\.$/,'').toLowerCase();
  const hasIdentity=raw.toLowerCase().includes(normalizedIdentity);
  const hasTxt=raw.includes(String(expectedTxt||''));
  const noerror=/status:\s*NOERROR/i.test(raw);
  return {
    noerror,
    aa:flags.has('aa'),
    ra:flags.has('ra'),
    has_identity:hasIdentity,
    has_expected_txt:hasTxt,
    verified:noerror&&flags.has('aa')&&!flags.has('ra')&&hasIdentity&&hasTxt,
    flags:[...flags],
  };
}

export function summarizeCheckHost(report){
  const data=report?.data&&typeof report.data==='object'?report.data:{};
  const nodes=[];
  for(const [name,node] of Object.entries(data)){
    const checks=Array.isArray(node?.checks)?node.checks:[];
    for(const check of checks){
      nodes.push({
        node:name,
        country:node?.countryCode||node?.country||null,
        city:node?.city||null,
        status:Number(check?.status),
        error:String(check?.errortext||''),
        target_ip:check?.target_ip||null,
      });
    }
  }
  const successful=nodes.filter(x=>x.status===1&&x.error==='');
  return {
    node_count:nodes.length,
    success_count:successful.length,
    successful_nodes:successful.map(x=>x.node),
    successful_countries:[...new Set(successful.map(x=>x.country).filter(Boolean))],
    checks:nodes,
  };
}

async function fetchWithTimeout(url,options={},timeoutMs=8000){
  const ctrl=new AbortController();
  const t=setTimeout(()=>ctrl.abort(),timeoutMs);
  try{
    return await fetch(url,{...options,signal:ctrl.signal});
  }finally{clearTimeout(t)}
}

export function authoritativeReceiptMatches(receipts,{transactionId,identityName}={}){
  const qname=String(identityName||'').toLowerCase();
  const rows=Array.isArray(receipts?.receipts)?receipts.receipts:[];
  const matches=rows.filter(r=>
    Number(r?.transaction_id)===Number(transactionId) &&
    String(r?.qname||'').toLowerCase()===qname &&
    String(r?.protocol||'').toLowerCase()==='udp' &&
    r?.aa===true &&
    r?.ra===false &&
    Number(r?.rcode)===0 &&
    Number(r?.answer_count)>=1
  );
  return {
    verified:matches.length>=2 && new Set(matches.map(r=>r.remote_address).filter(Boolean)).size>=2,
    match_count:matches.length,
    distinct_remote_addresses:new Set(matches.map(r=>r.remote_address).filter(Boolean)).size,
    matches
  };
}

function localProtocolProof(file){
  try{
    const j=JSON.parse(fs.readFileSync(file,'utf8'));
    const udp=j?.udp||{}, tcp=j?.tcp||{};
    const verified=
      j?.verified===true &&
      udp?.ok===true && tcp?.ok===true &&
      udp?.aa===true && tcp?.aa===true &&
      udp?.ra===false && tcp?.ra===false &&
      Number(udp?.answers)>=1 && Number(tcp?.answers)>=1;
    return {verified,receipt:j};
  }catch(e){
    return {verified:false,error:String(e?.message||e)};
  }
}

async function waitForReceipt(file,args){
  for(let i=0;i<20;i++){
    try{
      const j=JSON.parse(fs.readFileSync(file,'utf8'));
      const match=authoritativeReceiptMatches(j,args);
      if(match.verified) return match;
    }catch{}
    await sleep(200);
  }
  try{
    const j=JSON.parse(fs.readFileSync(file,'utf8'));
    return authoritativeReceiptMatches(j,args);
  }catch(e){
    return {verified:false,match_count:0,distinct_remote_addresses:0,error:String(e?.message||e)};
  }
}

async function dispatchCheckHost(method,{server,port,payload}){
  const body={target:server,port,region:['US','DE'],repeatchecks:0,timeout:4000};
  if(payload) body.payload=payload;
  const res=await fetchWithTimeout('https://api.check-host.cc/'+method,{
    method:'POST',
    headers:{'content-type':'application/json','accept':'application/json'},
    body:JSON.stringify(body)
  },10000);
  const json=await res.json();
  if(!res.ok||json?.success!==true||!json?.uuid) throw new Error('check_host_dispatch_failed_'+method);
  return json;
}

async function pollCheckHost(uuid){
  for(let i=0;i<12;i++){
    await sleep(i===0?1200:1000);
    const res=await fetchWithTimeout('https://api.check-host.cc/report/'+encodeURIComponent(uuid),{
      headers:{accept:'application/json'}
    },10000);
    const json=await res.json();
    if(res.ok&&json?.data&&Object.keys(json.data).length>0){
      const summary=summarizeCheckHost(json);
      if(summary.node_count>0) return {json,summary};
    }
  }
  throw new Error('check_host_report_timeout');
}

async function runCheck(method,args){
  const started=await dispatchCheckHost(method,args);
  const {summary}=await pollCheckHost(started.uuid);
  return {
    uuid:started.uuid,
    report_url:started.reportURL||('https://check-host.cc/report/'+started.uuid),
    ...summary,
  };
}

export async function verifyExternalDns({server,identityName,expectedTxt,receiptPath,localProofPath}){
  const transactionId=randomInt(1,65536);
  const payload=dnsTxtQueryHex(identityName,transactionId);
  const localProof=localProtocolProof(localProofPath);
  const [tcp53,udp53,tcpDiag,udpDiag]=await Promise.all([
    runCheck('tcp',{server,port:53}).catch(e=>({error:String(e?.message||e),success_count:0})),
    runCheck('udp',{server,port:53,payload}).catch(e=>({error:String(e?.message||e),success_count:0})),
    runCheck('tcp',{server,port:53053}).catch(e=>({error:String(e?.message||e),success_count:0})),
    runCheck('udp',{server,port:53053,payload}).catch(e=>({error:String(e?.message||e),success_count:0})),
  ]);
  const runtimeIdentity=await waitForReceipt(receiptPath,{transactionId,identityName});
  const tcp53Reachable=Number(tcp53?.success_count||0)>=2;
  const udp53Reachable=Number(udp53?.success_count||0)>=2;
  const diagnosticReachable=
    Number(tcpDiag?.success_count||0)>=1 ||
    Number(udpDiag?.success_count||0)>=1;

  // TCP proof is compositional but protocol-grounded:
  // 1) outside nodes complete TCP handshakes to public :53,
  // 2) the router maps that exact public port to the same resident :1053 socket,
  // 3) the local canary proves that resident socket answers DNS over TCP with AA=1/RA=0,
  // 4) a nonce-correlated external UDP query proves the public mapping reaches this exact runtime.
  const verified=
    localProof.verified===true &&
    runtimeIdentity.verified===true &&
    tcp53Reachable &&
    udp53Reachable;

  const classification=verified
    ? 'public_dns_verified_composed_tcp_udp_identity'
    : (tcp53Reachable||udp53Reachable)
      ? 'production_53_reachable_identity_unverified'
      : diagnosticReachable
        ? 'diagnostic_high_port_reachable_production_53_unreachable'
        : 'no_external_path_to_candidate';

  return {
    schema:'evercraft.edge.external-public-verification.v2',
    verified,
    classification,
    identity_name:identityName,
    expected_txt:expectedTxt,
    transaction_id:transactionId,
    runtime_identity:runtimeIdentity,
    local_protocol_proof:localProof,
    tcp_proof_mode:'external_handshake_plus_local_dns_protocol_plus_nonce_correlated_same_runtime',
    distributed:{tcp53,udp53,tcp53053:tcpDiag,udp53053:udpDiag},
    public_ip_persisted_in_repo:false,
    observed_at:new Date().toISOString(),
  };
}

const direct=process.argv[1]&&import.meta.url===new URL('file:'+process.argv[1]).href;
if(direct){
  const server=arg('--server');
  const identityName=arg('--name');
  const expectedTxt=arg('--expected-txt','service=evercraft://edge/canary');
  const receiptPath=arg('--receipt-path','/var/lib/evercraft/nodeseed/edge-dns/query-receipts.json');
  const localProofPath=arg('--local-proof','/tmp/evercraft-edge-dns-local-canary.json');
  if(!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(server)) throw new Error('--server IPv4 required');
  if(!identityName) throw new Error('--name required');
  const receipt=await verifyExternalDns({server,identityName,expectedTxt,receiptPath,localProofPath});
  console.log(JSON.stringify(receipt,null,2));
  if(!receipt.verified) process.exitCode=2;
}
