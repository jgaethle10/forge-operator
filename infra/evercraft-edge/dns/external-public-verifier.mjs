#!/usr/bin/env node
import process from 'node:process';

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const arg=(name,fallback='')=>{
  const i=process.argv.indexOf(name);
  return i>=0&&process.argv[i+1]?process.argv[i+1]:fallback;
};

export function dnsTxtQueryHex(name){
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
  h.writeUInt16BE(0x4556,0);
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

async function isitdnsTcp({server,identityName,expectedTxt}){
  const name=String(identityName||'').replace(/\.$/,'');
  const qs=new URLSearchParams({
    transport:'tcp53',
    norec:'1',
    dnssec:'0',
    family:'v4'
  });
  const url='https://isitdns.net/dig/'+encodeURIComponent(name)+'/TXT/'+encodeURIComponent(server)+'?'+qs.toString();
  const res=await fetchWithTimeout(url,{headers:{accept:'text/plain','user-agent':'curl/8.0'}},10000);
  const text=await res.text();
  const parsed=parseDigAuthority(text,{identityName,expectedTxt});
  return {
    ok:res.ok,
    status:res.status,
    evidence_surface:'isitdns-dig-custom-ip-tcp53',
    evidence_url:url.replace(server,'<candidate-ip>'),
    parsed,
    excerpt:text.slice(0,4000),
  };
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

export async function verifyExternalDns({server,identityName,expectedTxt}){
  const payload=dnsTxtQueryHex(identityName);
  const tcpIdentity=await isitdnsTcp({server,identityName,expectedTxt}).catch(e=>({ok:false,error:String(e?.message||e),parsed:{verified:false}}));
  const [tcp53,udp53,tcpDiag,udpDiag]=await Promise.all([
    runCheck('tcp',{server,port:53}).catch(e=>({error:String(e?.message||e),success_count:0})),
    runCheck('udp',{server,port:53,payload}).catch(e=>({error:String(e?.message||e),success_count:0})),
    runCheck('tcp',{server,port:53053}).catch(e=>({error:String(e?.message||e),success_count:0})),
    runCheck('udp',{server,port:53053,payload}).catch(e=>({error:String(e?.message||e),success_count:0})),
  ]);
  const tcp53Reachable=Number(tcp53?.success_count||0)>=2;
  const udp53Reachable=Number(udp53?.success_count||0)>=2;
  const diagnosticReachable=
    Number(tcpDiag?.success_count||0)>=1 ||
    Number(udpDiag?.success_count||0)>=1;
  const verified=
    tcpIdentity?.parsed?.verified===true &&
    tcp53Reachable &&
    udp53Reachable;
  const classification=verified
    ? 'public_dns_verified'
    : (tcp53Reachable||udp53Reachable)
      ? 'production_53_reachable_identity_unverified'
      : diagnosticReachable
        ? 'diagnostic_high_port_reachable_production_53_unreachable'
        : 'no_external_path_to_candidate';
  return {
    schema:'evercraft.edge.external-public-verification.v1',
    verified,
    classification,
    identity_name:identityName,
    expected_txt:expectedTxt,
    tcp53_identity:tcpIdentity,
    distributed:{
      tcp53,udp53,tcp53053:tcpDiag,udp53053:udpDiag
    },
    public_ip_persisted_in_repo:false,
    observed_at:new Date().toISOString(),
  };
}

const direct=process.argv[1]&&import.meta.url===new URL('file:'+process.argv[1]).href;
if(direct){
  const server=arg('--server');
  const identityName=arg('--name');
  const expectedTxt=arg('--expected-txt','service=evercraft://edge/canary');
  if(!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(server)) throw new Error('--server IPv4 required');
  if(!identityName) throw new Error('--name required');
  const receipt=await verifyExternalDns({server,identityName,expectedTxt});
  console.log(JSON.stringify(receipt,null,2));
  if(!receipt.verified) process.exitCode=2;
}
