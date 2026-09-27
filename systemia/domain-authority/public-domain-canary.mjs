import dns from 'node:dns/promises';
import tls from 'node:tls';

function domain(value){
  const v=String(value||'').trim().toLowerCase().replace(/\.$/,'');
  if(!v) throw new Error('domain_required');
  return v;
}
function normalizeHost(value){ return String(value||'').toLowerCase().replace(/\.$/,''); }
function hasTxt(rows,prefix){ return rows.flat().some(v=>String(v).startsWith(prefix)); }

async function safe(fn){
  try{return {ok:true,value:await fn()};}
  catch(error){return {ok:false,error:String(error?.code||error?.message||error)};}
}

async function trustedTls(host,port=443,timeoutMs=8000){
  return await new Promise(resolve=>{
    const socket=tls.connect({
      host,
      port,
      servername:host,
      rejectUnauthorized:true,
      timeout:timeoutMs,
    },()=>{
      const cert=socket.getPeerCertificate();
      const out={
        ok:socket.authorized===true,
        authorized:socket.authorized===true,
        authorization_error:socket.authorizationError||null,
        protocol:socket.getProtocol()||null,
        subject_cn:cert?.subject?.CN||null,
        valid_to:cert?.valid_to||null,
      };
      socket.end();
      resolve(out);
    });
    socket.once('timeout',()=>{socket.destroy();resolve({ok:false,error:'timeout'});});
    socket.once('error',error=>resolve({ok:false,error:String(error.code||error.message)}));
  });
}

export async function inspectPublicDomain({
  domain:domainInput,
  edgeHost='edge',
  expectedNameservers=[],
  requireTls=true,
}={}){
  const zone=domain(domainInput);
  const edge=normalizeHost(edgeHost.includes('.')?edgeHost:`${edgeHost}.${zone}`);
  const [ns,soa,a,aaaa,tlsResult]=await Promise.all([
    safe(()=>dns.resolveNs(zone)),
    safe(()=>dns.resolveSoa(zone)),
    safe(()=>dns.resolve4(edge)),
    safe(()=>dns.resolve6(edge)),
    requireTls?trustedTls(edge):Promise.resolve({ok:null,skipped:true}),
  ]);

  const seenNs=ns.ok?ns.value.map(normalizeHost):[];
  const wanted=(Array.isArray(expectedNameservers)?expectedNameservers:[]).map(normalizeHost);
  const delegationMatches=wanted.length===0?seenNs.length>=2:wanted.every(x=>seenNs.includes(x));
  const addressPublished=(a.ok&&a.value.length>0)||(aaaa.ok&&aaaa.value.length>0);

  const gates={
    soa_publicly_resolvable:soa.ok,
    at_least_two_authoritative_nameservers:seenNs.length>=2,
    expected_delegation_matches:delegationMatches,
    edge_address_publicly_resolvable:addressPublished,
    trusted_public_tls:requireTls?tlsResult.ok===true:true,
  };
  return {
    schema:'evercraft.domain-authority.public-canary.v1',
    domain:zone,
    edge_host:edge,
    gates,
    ready:Object.values(gates).every(Boolean),
    observed:{
      nameservers:seenNs,
      soa:soa.ok?soa.value:null,
      ipv4:a.ok?a.value:[],
      ipv6:aaaa.ok?aaaa.value:[],
      tls:tlsResult,
    },
    errors:{
      nameservers:ns.ok?null:ns.error,
      soa:soa.ok?null:soa.error,
      ipv4:a.ok?null:a.error,
      ipv6:aaaa.ok?null:aaaa.error,
    },
  };
}

if(import.meta.url===`file://${process.argv[1]}`){
  const args=Object.fromEntries(process.argv.slice(2).map(item=>{
    const [k,...rest]=item.replace(/^--/,'').split('=');
    return [k,rest.join('=')];
  }));
  const result=await inspectPublicDomain({
    domain:args.domain,
    edgeHost:args['edge-host']||'edge',
    expectedNameservers:String(args.nameservers||'').split(',').filter(Boolean),
    requireTls:args['require-tls']!=='false',
  });
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  if(!result.ready) process.exitCode=2;
}
