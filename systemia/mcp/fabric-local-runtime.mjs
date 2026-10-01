#!/usr/bin/env node
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  executeFabricDirectoryRpc,
  fabricDirectoryTools,
  fabricOpenAiTools,
  loadFabricCatalogFromRepository,
  normalizeFabricCatalog,
  validateOpenAiChallengeToken,
} from './fabric-directory.mjs';
import {
  renderCapabilities,
  renderCapabilityDetail,
  renderFabricHome,
  renderOpenAiPluginHome,
  renderOpenAiPolicyDocument,
  renderMarkdownDocument,
} from './fabric-public-site.mjs';

function isLegacyBase44Connection(connection={}) {
  try {
    const url = new URL(String(connection.url||''));
    return /(^|\.)base44\.app$/i.test(url.hostname);
  } catch {
    return false;
  }
}

export function nativeOnlyCatalog(input=[]) {
  const normalized=normalizeFabricCatalog(input);
  let removed=0;
  let removedMcp=0;
  const capabilities=normalized.map((item)=>({
    ...item,
    connections:item.connections.filter((connection)=>{
      const legacy=isLegacyBase44Connection(connection);
      if (legacy) {
        removed+=1;
        if (String(connection.type||'').toLowerCase()==='mcp') removedMcp+=1;
      }
      return !legacy;
    }),
  }));
  return {
    capabilities,
    removed_legacy_base44_connections:removed,
    removed_legacy_base44_mcp_connections:removedMcp,
  };
}

function sendJson(res,status,body,extraHeaders={}) {
  const data=Buffer.from(JSON.stringify(body));
  res.writeHead(status,{
    'content-type':'application/json; charset=utf-8',
    'content-length':data.length,
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
    'mcp-protocol-version':'2025-03-26',
    ...extraHeaders,
  });
  res.end(data);
}

function sendEventStream(res,status,body,extraHeaders={}) {
  const data=Buffer.from(`event: message\ndata: ${JSON.stringify(body)}\n\n`);
  res.writeHead(status,{
    'content-type':'text/event-stream; charset=utf-8',
    'content-length':data.length,
    'cache-control':'no-store',
    'connection':'keep-alive',
    'x-content-type-options':'nosniff',
    'mcp-protocol-version':'2025-03-26',
    ...extraHeaders,
  });
  res.end(data);
}

function acceptsEventStream(req) {
  return String(req.headers.accept||'')
    .toLowerCase()
    .split(',')
    .map((value)=>value.trim())
    .some((value)=>value==='text/event-stream'||value.startsWith('text/event-stream;'));
}

function browserSecurityHeaders() {
  return {
    'x-content-type-options':'nosniff',
    'x-frame-options':'DENY',
    'referrer-policy':'no-referrer',
    'permissions-policy':'camera=(), microphone=(), geolocation=()',
    'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  };
}

function sendText(res,status,body,{contentType='text/plain; charset=utf-8'}={}) {
  const data=Buffer.from(String(body));
  res.writeHead(status,{
    'content-type':contentType,
    'content-length':data.length,
    'cache-control':'public, max-age=300',
    ...browserSecurityHeaders(),
  });
  res.end(data);
}

function sendBuffer(res,status,data,{contentType='application/octet-stream',cacheControl='public, max-age=86400'}={}) {
  res.writeHead(status,{
    'content-type':contentType,
    'content-length':data.length,
    'cache-control':cacheControl,
    ...browserSecurityHeaders(),
  });
  res.end(data);
}

function journalContentType(file) {
  const ext=path.extname(file).toLowerCase();
  if(ext==='.html') return 'text/html; charset=utf-8';
  if(ext==='.json'||ext==='.jsonld') return 'application/json; charset=utf-8';
  if(ext==='.xml') return 'application/xml; charset=utf-8';
  if(ext==='.txt') return 'text/plain; charset=utf-8';
  if(ext==='.svg') return 'image/svg+xml';
  if(ext==='.png') return 'image/png';
  if(ext==='.jpg'||ext==='.jpeg') return 'image/jpeg';
  if(ext==='.webp') return 'image/webp';
  return 'application/octet-stream';
}

function resolveJournalAsset(journalDir, requestUrl) {
  const parsed=new URL(requestUrl,'http://fabric.local');
  let pathname=decodeURIComponent(parsed.pathname);
  if(!pathname.startsWith('/journal')) return null;
  let relative=pathname.slice('/journal'.length).replace(/^\/+/, '');
  if(!relative||relative.endsWith('/')) relative+=relative?'index.html':'index.html';
  const target=path.resolve(journalDir,relative);
  const prefix=journalDir.endsWith(path.sep)?journalDir:journalDir+path.sep;
  if(target!==journalDir&&!target.startsWith(prefix)) return null;
  if(!fs.existsSync(target)||!fs.statSync(target).isFile()) return null;
  return target;
}

async function readJson(req,{maxBytes=1024*1024}={}) {
  const chunks=[];
  let bytes=0;
  for await (const chunk of req) {
    bytes+=chunk.length;
    if (bytes>maxBytes) throw new Error('request_body_too_large');
    chunks.push(chunk);
  }
  const raw=Buffer.concat(chunks).toString('utf8');
  return raw?JSON.parse(raw):{};
}

export async function startFabricLocalRuntime({
  host='127.0.0.1',
  port=8787,
  catalog=null,
  challengeToken='',
  nodeReceiptPath='',
  allocatorTokenFile='',
  nodeAttestationProvider=null,
}={}) {
  const instanceId='fabric_local_'+crypto.randomBytes(10).toString('hex');
  let deploymentReceiptRef='';
  if (
    nodeAttestationProvider !== null &&
    typeof nodeAttestationProvider !== 'function'
  ) {
    throw new Error('node_attestation_provider_invalid');
  }
  const staticPrepared=Array.isArray(catalog)?nativeOnlyCatalog(catalog):null;
  const preparedCatalog=()=>staticPrepared||nativeOnlyCatalog(loadFabricCatalogFromRepository());
  const token=validateOpenAiChallengeToken(challengeToken);
  const challengePath='/.well-known/openai-apps-challenge';
  const edgeAttestationPath='/.well-known/evercraft-edge-attestation';
  const resolvedNodeReceipt=path.resolve(
    nodeReceiptPath||path.join(os.homedir(),'.local/state/evercraft/organism/compute/nodeseed-receipt.json')
  );
  const resolvedAllocatorToken=path.resolve(
    allocatorTokenFile||path.join(os.homedir(),'.local/state/evercraft/organism/.secrets/allocator-token')
  );
  const edgeAttestationReady=()=>Boolean(nodeAttestationProvider)||
    (fs.existsSync(resolvedNodeReceipt)&&fs.existsSync(resolvedAllocatorToken));

  async function nodeAttestation(nonce){
    const nonceValue=String(nonce||'').trim();
    if(!/^[A-Za-z0-9._:-]{16,256}$/.test(nonceValue)) throw new Error('edge_attestation_nonce_invalid');
    if(!edgeAttestationReady()) throw new Error('edge_attestation_not_configured');
    if(nodeAttestationProvider){
      const provided=await nodeAttestationProvider(nonceValue);
      const attestation=provided?.attestation||provided;
      if(!attestation||typeof attestation!=='object'){
        throw new Error('edge_attestation_provider_invalid');
      }
      return {
        schema:'evercraft.operator-public-edge.attestation.v1',
        trust_class:'operator_authorized_public_edge',
        attestation,
        allocator_authority_exposed:false,
        allocator_authority_persisted:false,
        physical_field_claim:false,
        observed_at:new Date().toISOString(),
      };
    }
    const receipt=JSON.parse(fs.readFileSync(resolvedNodeReceipt,'utf8'));
    const endpoint=new URL(String(receipt?.endpoint||''));
    if(endpoint.protocol!=='http:'||!['127.0.0.1','localhost','::1'].includes(endpoint.hostname.toLowerCase())){
      throw new Error('nodeseed_attestation_endpoint_must_be_loopback');
    }
    const token=fs.readFileSync(resolvedAllocatorToken,'utf8').trim();
    if(!token) throw new Error('nodeseed_allocator_token_missing');
    const target=new URL('/v1/attest',endpoint);
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),5000);
    try{
      const response=await fetch(target,{
        method:'POST',
        headers:{authorization:'Bearer '+token,'content-type':'application/json','accept':'application/json'},
        body:JSON.stringify({nonce:nonceValue}),
        signal:controller.signal,
      });
      const body=await response.json().catch(()=>null);
      if(!response.ok||body?.ok!==true||!body?.attestation) throw new Error('nodeseed_attestation_failed');
      return {
        schema:'evercraft.operator-public-edge.attestation.v1',
        trust_class:'operator_authorized_public_edge',
        attestation:body.attestation,
        allocator_authority_exposed:false,
        allocator_authority_persisted:false,
        physical_field_claim:false,
        observed_at:new Date().toISOString(),
      };
    }finally{clearTimeout(timer);}
  }
  const moduleDir=path.dirname(fileURLToPath(import.meta.url));
  const pluginDir=path.resolve(moduleDir,'../../plugins/evercraft-fabric');
  const journalDir=path.resolve(moduleDir,'../../public/journal');
  const docs={
    privacy:fs.readFileSync(path.join(pluginDir,'PRIVACY.md'),'utf8'),
    terms:fs.readFileSync(path.join(pluginDir,'TERMS.md'),'utf8'),
    support:fs.readFileSync(path.join(pluginDir,'SUPPORT.md'),'utf8'),
  };
  const brandIcon=fs.readFileSync(path.join(pluginDir,'assets','evercraft-icon.png'));

  const health=()=>{
    const prepared=preparedCatalog();
    return ({
    ok:true,
    service:'evercraft-fabric-local',
    server:'evercraft-fabric',
    version:'1.1.0',
    runtime:nodeAttestationProvider?'Evercraft Compute':'Evercraft Fabric local',
    instance_id:instanceId,
    deployment_receipt_bound:Boolean(deploymentReceiptRef),
    deployment_receipt_ref:deploymentReceiptRef||null,
    transport:'Streamable HTTP',
    transport_modes:['application/json','text/event-stream'],
    mcp_path:'/mcp',
    openai_mcp_path:'/mcp/openai',
    tools:fabricDirectoryTools().map((tool)=>tool.name),
    openai_tools:fabricOpenAiTools().map((tool)=>tool.name),
    capability_count:preparedCatalog().capabilities.length,
    read_only:true,
    transactional:false,
    external_action_authority:false,
    base44_transport_enabled:false,
    removed_legacy_base44_connections:prepared.removed_legacy_base44_connections,
    removed_legacy_base44_mcp_connections:prepared.removed_legacy_base44_mcp_connections,
    secure_tunnel_compatible:true,
    public_https_runtime_capable:true,
    edge_attestation_supported:edgeAttestationReady(),
    edge_attestation_path:edgeAttestationReady()?edgeAttestationPath:null,
    edge_attestation_allocator_authority_exposed:false,
    edge_attestation_source:nodeAttestationProvider
      ? 'in_process_nodeseed_identity'
      : edgeAttestationReady()
        ? 'loopback_nodeseed'
        : null,
    public_plugin_source_ready:true,
    public_plugin_external_verification_required:true,
    journal_mirror_path:'/journal/',
    journal_mirror_ready:fs.existsSync(path.join(journalDir,'index.html')),
    journal_mirror_indexing:'noindex_until_dedicated_origin',
    provider_publication_state:'external_to_runtime',
    public_submission_note:'This runtime reports source capability only. Submission readiness additionally requires a fresh external HTTPS/OpenAI-profile canary, provider scan, and account-side review gates.',
    catalog_reload_mode:staticPrepared?'static_injected':'hot_reload_repository',
  });
  };

  const server=http.createServer(async(req,res)=>{
    try {
      if (req.method==='OPTIONS') {
        res.writeHead(204,{
          'access-control-allow-origin':'*',
          'access-control-allow-headers':'content-type, accept, mcp-protocol-version, mcp-session-id',
          'access-control-expose-headers':'mcp-protocol-version, mcp-session-id',
          'access-control-allow-methods':'GET, POST, OPTIONS',
        });
        return res.end();
      }

      if (req.method==='GET' && req.url==='/health') {
        return sendJson(res,200,health());
      }

      if (req.method==='GET' && req.url==='/') {
        return sendText(
          res,
          200,
          renderFabricHome({capabilities:preparedCatalog().capabilities}),
          {contentType:'text/html; charset=utf-8'}
        );
      }

      if (req.method==='GET' && req.url==='/openai') {
        return sendText(
          res,
          200,
          renderOpenAiPluginHome(),
          {contentType:'text/html; charset=utf-8'}
        );
      }

      if (req.method==='GET' && req.url==='/openai/privacy') {
        return sendText(res,200,renderOpenAiPolicyDocument('Evercraft Privacy Policy',docs.privacy),{contentType:'text/html; charset=utf-8'});
      }
      if (req.method==='GET' && req.url==='/openai/terms') {
        return sendText(res,200,renderOpenAiPolicyDocument('Evercraft Terms of Service',docs.terms),{contentType:'text/html; charset=utf-8'});
      }
      if (req.method==='GET' && req.url==='/openai/support') {
        return sendText(res,200,renderOpenAiPolicyDocument('Evercraft Support',docs.support),{contentType:'text/html; charset=utf-8'});
      }

      if (req.method==='GET' && req.url==='/capabilities') {
        return sendText(
          res,
          200,
          renderCapabilities(preparedCatalog().capabilities),
          {contentType:'text/html; charset=utf-8'}
        );
      }

      if (req.method==='GET' && req.url==='/capabilities.json') {
        const prepared=preparedCatalog();
        return sendJson(res,200,{
          ok:true,
          directory:'Evercraft Fabric',
          capabilities:prepared.capabilities,
          returned:prepared.capabilities.length,
          transactional:false,
          external_action_taken:false,
        });
      }

      if (req.method==='GET' && String(req.url||'').startsWith('/capabilities/')) {
        const parsed=new URL(String(req.url||''),'http://fabric.local');
        const raw=decodeURIComponent(parsed.pathname.slice('/capabilities/'.length));
        if(raw&&!raw.includes('/')){
          const wantsJson=raw.endsWith('.json');
          const publicId=wantsJson?raw.slice(0,-5):raw;
          const capability=preparedCatalog().capabilities.find((item)=>item.public_id===publicId);
          if(!capability) return sendJson(res,404,{error:'capability_not_found'});
          if(wantsJson) return sendJson(res,200,{
            ok:true,
            directory:'Evercraft Fabric',
            capability,
            transactional:false,
            external_action_taken:false,
          });
          return sendText(
            res,
            200,
            renderCapabilityDetail(capability),
            {contentType:'text/html; charset=utf-8'}
          );
        }
      }

      if (req.method==='GET' && req.url==='/assets/evercraft-icon.png') {
        return sendBuffer(res,200,brandIcon,{contentType:'image/png'});
      }

      if (req.method==='GET' && req.url==='/privacy') {
        return sendText(res,200,renderMarkdownDocument('Evercraft Fabric Privacy Policy',docs.privacy),{contentType:'text/html; charset=utf-8'});
      }
      if (req.method==='GET' && req.url==='/terms') {
        return sendText(res,200,renderMarkdownDocument('Evercraft Fabric Terms of Service',docs.terms),{contentType:'text/html; charset=utf-8'});
      }
      if (req.method==='GET' && req.url==='/support') {
        return sendText(res,200,renderMarkdownDocument('Evercraft Fabric Support',docs.support),{contentType:'text/html; charset=utf-8'});
      }

      if (req.url===edgeAttestationPath) {
        if(req.method!=='POST') return sendJson(res,405,{error:'method_not_allowed'});
        const body=await readJson(req,{maxBytes:4096});
        try{
          return sendJson(res,200,{ok:true,...await nodeAttestation(body?.nonce)});
        }catch{
          return sendJson(res,503,{ok:false,error:'edge_attestation_unavailable'});
        }
      }

      if ((req.method==='GET'||req.method==='HEAD') && String(req.url||'').startsWith('/journal')) {
        const asset=resolveJournalAsset(journalDir,String(req.url||''));
        if(!asset) return sendJson(res,404,{error:'journal_asset_not_found'});
        const data=fs.readFileSync(asset);
        res.writeHead(200,{
          'content-type':journalContentType(asset),
          'content-length':data.length,
          'cache-control':'public, max-age=60, must-revalidate',
          'x-content-type-options':'nosniff',
          'x-robots-tag':'noindex, nofollow',
          'referrer-policy':'strict-origin-when-cross-origin',
        });
        if(req.method==='HEAD') return res.end();
        return res.end(data);
      }

      if (req.url===challengePath) {
        if (!['GET','HEAD'].includes(req.method||'')) {
          return sendJson(res,405,{error:'method_not_allowed'});
        }
        if (!token) return sendJson(res,404,{error:'openai_challenge_not_configured'});
        const data=Buffer.from(token,'utf8');
        res.writeHead(200,{
          'content-type':'text/plain; charset=utf-8',
          'content-length':data.length,
          'cache-control':'no-store',
          'x-content-type-options':'nosniff',
        });
        if (req.method==='HEAD') return res.end();
        return res.end(data);
      }

      const openAiMcp=req.url==='/mcp/openai';
      const internalMcp=req.url==='/mcp';
      if (!openAiMcp&&!internalMcp) return sendJson(res,404,{error:'not_found'});

      if (req.method==='GET') {
        const body={
          ok:true,
          service:openAiMcp?'Evercraft Public Plugin':'Evercraft Fabric',
          server:'evercraft-fabric',
          version:'1.1.0',
          transport:'Streamable HTTP',
          transport_modes:['application/json','text/event-stream'],
          tools:(openAiMcp?fabricOpenAiTools():fabricDirectoryTools()).map((tool)=>tool.name),
          capability_count:openAiMcp?null:preparedCatalog().capabilities.length,
          read_only:true,
          base44_transport_enabled:false,
          public_plugin_profile:openAiMcp,
        };
        if (acceptsEventStream(req)) return sendEventStream(res,200,body);
        return sendJson(res,200,body);
      }

      if (req.method!=='POST') return sendJson(res,405,{error:'method_not_allowed'});
      const rpc=await readJson(req);
      const response=await executeFabricDirectoryRpc(
        rpc,
        preparedCatalog().capabilities,
        {toolProfile:openAiMcp?'openai':'full'}
      );
      if (response===null) {
        res.writeHead(202,{
          'cache-control':'no-store',
          'mcp-protocol-version':'2025-03-26',
        });
        return res.end();
      }
      const sessionHeaders=rpc?.method==='initialize'
        ? {'mcp-session-id':crypto.randomUUID()}
        : {};
      if (acceptsEventStream(req)) return sendEventStream(res,200,response,sessionHeaders);
      return sendJson(res,200,response,sessionHeaders);
    } catch(error) {
      return sendJson(res,502,{
        jsonrpc:'2.0',
        id:null,
        error:{
          code:-32000,
          message:error instanceof Error?error.message:String(error),
        },
      });
    }
  });

  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(port,host,resolve);
  });

  const address=server.address();
  const actualPort=typeof address==='object'&&address?address.port:port;
  const url=`http://${host}:${actualPort}`;

  return {
    schema:'evercraft.fabric-local-runtime.v1',
    instanceId,
    url,
    mcpUrl:url+'/mcp',
    openAiMcpUrl:url+'/mcp/openai',
    health,
    setDeploymentReceipt(value){
      const receipt=String(value||'').trim();
      if(!/^(?:sha256:)?[a-f0-9]{64}$/i.test(receipt)){
        throw new Error('deployment_receipt_ref_invalid');
      }
      deploymentReceiptRef=receipt;
      return health();
    },
    close:()=>new Promise((resolve,reject)=>
      server.close((error)=>error?reject(error):resolve())
    ),
  };
}

function arg(name,fallback=null) {
  const i=process.argv.indexOf(name);
  return i>=0&&process.argv[i+1]?process.argv[i+1]:fallback;
}

const direct=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if (direct) {
  const host=String(arg('--host',process.env.EVERCRAFT_FABRIC_HOST||'127.0.0.1'));
  const port=Number(arg('--port',process.env.EVERCRAFT_FABRIC_PORT||'8787'));
  const challengeToken=String(arg('--openai-challenge-token',process.env.EVERCRAFT_OPENAI_CHALLENGE_TOKEN||''));
  const nodeReceiptPath=String(arg('--node-receipt',process.env.EVERCRAFT_EDGE_NODE_RECEIPT||''));
  const allocatorTokenFile=String(arg('--allocator-token-file',process.env.EVERCRAFT_EDGE_ALLOCATOR_TOKEN_FILE||''));
  const runtime=await startFabricLocalRuntime({host,port,challengeToken,nodeReceiptPath,allocatorTokenFile});
  process.stdout.write(JSON.stringify({
    ok:true,
    schema:runtime.schema,
    url:runtime.url,
    mcp_url:runtime.mcpUrl,
    ...runtime.health(),
  },null,2)+'\n');
  const shutdown=async()=>{
    await runtime.close();
    process.exit(0);
  };
  process.on('SIGINT',shutdown);
  process.on('SIGTERM',shutdown);
}
