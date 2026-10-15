import crypto from 'node:crypto';
import http from 'node:http';
import { spawnSync } from 'node:child_process';

const DEFAULT_REPOSITORY='ghcr.io/jgaethle10/forge-operator';
const DEFAULT_START_TIMEOUT_MS=45_000;
const MAX_PROXY_BODY_BYTES=16*1024*1024;

function command(command,args,{timeout=30_000}={}){
  const result=spawnSync(command,args,{
    encoding:'utf8',
    timeout,
    maxBuffer:8*1024*1024,
    stdio:['ignore','pipe','pipe'],
  });
  if(result.error) throw result.error;
  if(result.status!==0){
    const detail=String(result.stderr||result.stdout||'').trim().slice(0,4000);
    throw new Error(`${command}_failed:${detail||result.status}`);
  }
  return String(result.stdout||'').trim();
}

function validReleaseRef(value){
  return /^[a-f0-9]{40}$/i.test(String(value||'').trim());
}

function validDigest(value){
  return /^sha256:[a-f0-9]{64}$/i.test(String(value||'').trim());
}

function validRepository(value){
  const repo=String(value||'').trim();
  if(!/^ghcr\.io\/[a-z0-9._-]+\/[a-z0-9._-]+$/i.test(repo)){
    throw new Error('forge_operator_repository_invalid');
  }
  return repo;
}

export function forgeOperatorImageRef({
  releaseRef,
  imageDigest,
  repository=DEFAULT_REPOSITORY,
}={}){
  const release=String(releaseRef||'').trim().toLowerCase();
  const digest=String(imageDigest||'').trim().toLowerCase();
  if(!validReleaseRef(release)) throw new Error('forge_operator_release_ref_invalid');
  if(!validDigest(digest)) throw new Error('forge_operator_image_digest_invalid');
  const repo=validRepository(repository);
  return {
    release_ref:release,
    image_digest:digest,
    release_tag:`${repo}:${release}`,
    digest_ref:`${repo}@${digest}`,
    repository:repo,
  };
}

export function forgeOperatorContainerAvailable(){
  try{
    command('docker',['info','--format','{{.ServerVersion}}'],{timeout:5000});
    return true;
  }catch{
    return false;
  }
}

function parseDockerPort(value){
  for(const line of String(value||'').trim().split(/\r?\n/).filter(Boolean)){
    const match=line.match(/(?:127\.0\.0\.1|0\.0\.0\.0|\[::\]|::1):(\d+)$/);
    if(!match) continue;
    const port=Number(match[1]);
    if(Number.isInteger(port)&&port>0&&port<=65535) return port;
  }
  throw new Error('forge_operator_container_port_unavailable');
}

async function fetchJson(url,options={},timeoutMs=5000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(url,{...options,signal:controller.signal});
    const text=await response.text();
    let body={};
    try{body=text?JSON.parse(text):{};}catch{
      throw new Error(`forge_operator_invalid_json:${response.status}`);
    }
    if(!response.ok){
      const error=new Error(body?.error||`forge_operator_http_${response.status}`);
      error.status=response.status;
      error.body=body;
      throw error;
    }
    return body;
  }finally{
    clearTimeout(timer);
  }
}

async function waitForForge(url,timeoutMs=DEFAULT_START_TIMEOUT_MS){
  const deadline=Date.now()+timeoutMs;
  let lastError=null;
  while(Date.now()<deadline){
    try{
      const [health,benchmarks]=await Promise.all([
        fetchJson(`${url}/api/health`,{},1800),
        fetchJson(`${url}/api/systemia-university/benchmarks`,{},1800),
      ]);
      if(
        health?.ok===true &&
        health?.service==='forge-operator' &&
        benchmarks?.schema==='systemia.university.http-discovery.v1' &&
        benchmarks?.remote_persistence===false &&
        benchmarks?.public_write_allowed===false
      ){
        return {health,benchmarks};
      }
    }catch(error){
      lastError=error;
    }
    await new Promise(resolve=>setTimeout(resolve,300));
  }
  throw new Error(`forge_operator_health_timeout:${lastError?.message||'unknown'}`);
}

async function readBody(req,maxBytes=MAX_PROXY_BODY_BYTES){
  const chunks=[];
  let bytes=0;
  for await(const chunk of req){
    bytes+=chunk.length;
    if(bytes>maxBytes) throw new Error('forge_operator_proxy_body_too_large');
    chunks.push(chunk);
  }
  return chunks.length?Buffer.concat(chunks):null;
}

function safeProxyHeaders(headers={}){
  const out={};
  const allowed=new Set([
    'accept','content-type','authorization','user-agent','origin','referer',
    'mcp-session-id','last-event-id','x-evercraft-browser-claim'
  ]);
  for(const [key,value] of Object.entries(headers)){
    const name=String(key||'').toLowerCase();
    if(!allowed.has(name)||value==null) continue;
    out[name]=Array.isArray(value)?value.join(', '):String(value);
  }
  return out;
}

function safeResponseHeaders(headers){
  const out={};
  const allowed=new Set([
    'content-type','cache-control','content-security-policy','referrer-policy',
    'x-content-type-options','x-frame-options','location','link',
    'mcp-session-id','x-robots-tag'
  ]);
  for(const [key,value] of headers.entries()){
    if(allowed.has(key.toLowerCase())) out[key]=value;
  }
  return out;
}

async function startForgeAdapter({upstreamUrl,healthProvider}){
  const upstream=new URL(upstreamUrl);
  if(!['127.0.0.1','localhost','::1'].includes(upstream.hostname)){
    throw new Error('forge_operator_upstream_must_be_loopback');
  }

  const server=http.createServer(async(req,res)=>{
    try{
      const url=new URL(req.url||'/','http://evercraft.invalid');
      if(url.pathname==='/api/health'&&String(req.method||'GET').toUpperCase()==='GET'){
        const health=await healthProvider();
        const data=Buffer.from(JSON.stringify(health));
        res.writeHead(200,{
          'content-type':'application/json',
          'content-length':data.length,
          'cache-control':'no-store',
        });
        res.end(data);
        return;
      }

      const method=String(req.method||'GET').toUpperCase();
      if(method==='CONNECT'||method==='TRACE'){
        res.writeHead(405,{'content-type':'application/json'});
        res.end(JSON.stringify({error:'forge_operator_proxy_method_not_allowed'}));
        return;
      }
      const body=['GET','HEAD'].includes(method)?null:await readBody(req);
      const target=new URL(url.pathname+url.search,upstream);
      const response=await fetch(target,{
        method,
        headers:safeProxyHeaders(req.headers),
        body,
        redirect:'manual',
      });
      const responseBody=Buffer.from(await response.arrayBuffer());
      res.writeHead(response.status,{
        ...safeResponseHeaders(response.headers),
        'content-length':responseBody.length,
      });
      if(method==='HEAD') res.end();
      else res.end(responseBody);
    }catch(error){
      const data=Buffer.from(JSON.stringify({
        error:'forge_operator_public_adapter_error',
        detail:error instanceof Error?error.message:String(error),
      }));
      res.writeHead(502,{'content-type':'application/json','content-length':data.length});
      res.end(data);
    }
  });

  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  const address=server.address();
  const port=typeof address==='object'&&address?address.port:0;
  return {
    url:`http://127.0.0.1:${port}`,
    close:()=>new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve())),
  };
}

const OPTIONAL_ENV_ALLOWLIST=Object.freeze([
  'FORGE_CHECKOUT_URL',
  'CHUM_PUBLIC_ORIGIN',
  'CHUM_ATTRIBUTION_SECRET',
  'CHUM_ATTRIBUTION_SINK_URL',
  'CHUM_ATTRIBUTION_SINK_TOKEN',
  'CHUM_ATTRIBUTION_INGEST_TOKEN',
  'SYSTEMIA_MACHINE_KEY',
  'RIVET_REPORT_GATEWAY_TOKEN',
  'ALIEV_YARD_SOURCE_URL',
  'RIVET_REPORT_STATE_DIR',
]);

export async function startForgeOperatorContainer({
  releaseRef,
  imageDigest,
  releaseReceiptRef='',
  repository=DEFAULT_REPOSITORY,
  startTimeoutMs=DEFAULT_START_TIMEOUT_MS,
  requireAiReady=true,
}={}){
  const identity=forgeOperatorImageRef({releaseRef,imageDigest,repository});
  if(!forgeOperatorContainerAvailable()) throw new Error('forge_operator_container_runtime_unavailable');
  if(requireAiReady&& !String(process.env.GEMINI_API_KEY||'').trim()){
    throw new Error('forge_operator_gemini_api_key_required');
  }

  command('docker',['pull',identity.digest_ref],{timeout:5*60_000});
  const repoDigestsRaw=command(
    'docker',
    ['image','inspect',identity.digest_ref,'--format','{{json .RepoDigests}}'],
    {timeout:10_000}
  );
  let repoDigests=[];
  try{repoDigests=JSON.parse(repoDigestsRaw||'[]');}catch{}
  if(!Array.isArray(repoDigests)||!repoDigests.some(x=>String(x).toLowerCase()===identity.digest_ref.toLowerCase())){
    throw new Error('forge_operator_pulled_digest_mismatch');
  }

  const containerName=`evercraft-forge-${crypto.randomBytes(6).toString('hex')}`;
  const runArgs=[
    'run','-d','--rm','--init',
    '--name',containerName,
    '--pids-limit','1024',
    '--memory','2048m',
    '--cpus','2',
    '--label',`evercraft.release_ref=${identity.release_ref}`,
    '--label',`evercraft.image_digest=${identity.image_digest}`,
    '-e','NODE_ENV=production',
    '-e','PORT=3000',
  ];

  if(String(process.env.GEMINI_API_KEY||'').trim()) runArgs.push('-e','GEMINI_API_KEY');
  for(const name of OPTIONAL_ENV_ALLOWLIST){
    if(String(process.env[name]||'').trim()) runArgs.push('-e',name);
  }

  runArgs.push('-p','127.0.0.1::3000',identity.digest_ref);
  const containerId=command('docker',runArgs,{timeout:30_000});
  let adapter=null;
  let closed=false;
  let deploymentReceiptRef='';

  try{
    const published=command('docker',['port',containerId,'3000/tcp'],{timeout:5000});
    const port=parseDockerPort(published);
    const containerUrl=`http://127.0.0.1:${port}`;
    const initial=await waitForForge(containerUrl,startTimeoutMs);
    const instanceId=`forge_${containerId.slice(0,16)}`;

    const runtime={
      url:null,
      containerUrl,
      instanceId,
      releaseRef:identity.release_ref,
      imageDigest:identity.image_digest,
      releaseReceiptRef:String(releaseReceiptRef||'')||null,
      async health(){
        const [health,benchmarks]=await Promise.all([
          fetchJson(`${containerUrl}/api/health`,{},3000),
          fetchJson(`${containerUrl}/api/systemia-university/benchmarks`,{},3000),
        ]);
        return {
          ok:
            health?.ok===true &&
            health?.service==='forge-operator' &&
            benchmarks?.schema==='systemia.university.http-discovery.v1',
          service:'forge-operator',
          provider:'Evercraft',
          runtime:'Evercraft Compute',
          workload_class:'systemia.forge-operator-runtime.v1',
          instance_id:instanceId,
          immutable_container:true,
          release_ref:identity.release_ref,
          image_digest:identity.image_digest,
          release_execution_receipt_ref:String(releaseReceiptRef||'')||null,
          university_benchmark_ingress_ready:
            benchmarks?.schema==='systemia.university.http-discovery.v1',
          university_remote_persistence:benchmarks?.remote_persistence===true,
          university_public_write_allowed:benchmarks?.public_write_allowed===true,
          deployment_receipt_bound:Boolean(deploymentReceiptRef),
          deployment_receipt_ref:deploymentReceiptRef||null,
          upstream_health_ok:health?.ok===true,
          secret_material_exposed:false,
        };
      },
      setDeploymentReceipt(value){
        deploymentReceiptRef=String(value||'').trim();
        return {
          ok:true,
          service:'forge-operator',
          runtime:'Evercraft Compute',
          workload_class:'systemia.forge-operator-runtime.v1',
          instance_id:instanceId,
          deployment_receipt_bound:Boolean(deploymentReceiptRef),
          deployment_receipt_ref:deploymentReceiptRef||null,
          immutable_container:true,
          release_ref:identity.release_ref,
          image_digest:identity.image_digest,
        };
      },
      async close(){
        if(closed) return;
        closed=true;
        try{if(adapter) await adapter.close();}catch{}
        try{command('docker',['rm','-f',containerId],{timeout:15_000});}catch{}
      },
    };

    adapter=await startForgeAdapter({
      upstreamUrl:containerUrl,
      healthProvider:()=>runtime.health(),
    });
    runtime.url=adapter.url;
    runtime.initialHealth={
      ...initial.health,
      university_benchmark_ingress_ready:true,
    };
    return runtime;
  }catch(error){
    try{if(adapter) await adapter.close();}catch{}
    try{command('docker',['rm','-f',containerId],{timeout:15_000});}catch{}
    throw error;
  }
}
