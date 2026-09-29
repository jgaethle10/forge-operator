#!/usr/bin/env node
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  executeFabricDirectoryRpc,
  fabricDirectoryTools,
  loadFabricCatalogFromRepository,
  normalizeFabricCatalog,
  validateOpenAiChallengeToken,
} from './fabric-directory.mjs';

function isLegacyBase44Mcp(connection={}) {
  if (String(connection.type||'').toLowerCase() !== 'mcp') return false;
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
  const capabilities=normalized.map((item)=>({
    ...item,
    connections:item.connections.filter((connection)=>{
      const legacy=isLegacyBase44Mcp(connection);
      if (legacy) removed+=1;
      return !legacy;
    }),
  }));
  return {capabilities,removed_legacy_base44_mcp_connections:removed};
}

function sendJson(res,status,body) {
  const data=Buffer.from(JSON.stringify(body));
  res.writeHead(status,{
    'content-type':'application/json; charset=utf-8',
    'content-length':data.length,
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
  });
  res.end(data);
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
}={}) {
  const source=Array.isArray(catalog)?catalog:loadFabricCatalogFromRepository();
  const prepared=nativeOnlyCatalog(source);
  const token=validateOpenAiChallengeToken(challengeToken);
  const challengePath='/.well-known/openai-apps-challenge';

  const health=()=>({
    ok:true,
    service:'evercraft-fabric-local',
    server:'evercraft-fabric',
    version:'1.0.0',
    transport:'Streamable HTTP',
    mcp_path:'/mcp',
    tools:fabricDirectoryTools().map((tool)=>tool.name),
    capability_count:prepared.capabilities.length,
    read_only:true,
    transactional:false,
    external_action_authority:false,
    base44_transport_enabled:false,
    removed_legacy_base44_mcp_connections:prepared.removed_legacy_base44_mcp_connections,
    secure_tunnel_compatible:true,
    public_plugin_submission_ready:false,
    public_submission_note:'Secure MCP Tunnel is for private/developer-mode connectivity. Public plugin submission still requires stable public HTTPS.',
  });

  const server=http.createServer(async(req,res)=>{
    try {
      if (req.method==='OPTIONS') {
        res.writeHead(204,{
          'access-control-allow-origin':'*',
          'access-control-allow-headers':'content-type',
          'access-control-allow-methods':'GET, POST, OPTIONS',
        });
        return res.end();
      }

      if (req.method==='GET' && req.url==='/health') {
        return sendJson(res,200,health());
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

      if (req.url!=='/mcp') return sendJson(res,404,{error:'not_found'});

      if (req.method==='GET') {
        return sendJson(res,200,{
          ok:true,
          service:'Evercraft Fabric',
          server:'evercraft-fabric',
          version:'1.0.0',
          transport:'Streamable HTTP',
          tools:fabricDirectoryTools().map((tool)=>tool.name),
          capability_count:prepared.capabilities.length,
          read_only:true,
          base44_transport_enabled:false,
        });
      }

      if (req.method!=='POST') return sendJson(res,405,{error:'method_not_allowed'});
      const rpc=await readJson(req);
      const response=await executeFabricDirectoryRpc(rpc,prepared.capabilities);
      if (response===null) {
        res.writeHead(202,{'cache-control':'no-store'});
        return res.end();
      }
      return sendJson(res,200,response);
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
    url,
    mcpUrl:url+'/mcp',
    health,
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
  const runtime=await startFabricLocalRuntime({host,port,challengeToken});
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
