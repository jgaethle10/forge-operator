/**
 * Independently verifies the public Evercraft MCP protocol without granting
 * execution, payments, publication, customer contact or source-deploy authority.
 * A healthy protocol is NOT a bound Yard deployment.
 */
const ORIGIN = 'https://fabric.systemiacommandcenters.com';
const REQUIRED_TOOLS = [
  'match_evercraft_capability',
  'list_evercraft_capabilities',
  'get_evercraft_connection_options',
];
function rpcMessage(text) {
  const event = text.split(/\r?\n/).find(line => line.startsWith('data: '));
  if (event) return JSON.parse(event.slice(6));
  return JSON.parse(text);
}
async function request(fetcher, path, init = {}) {
  const res = await fetcher(ORIGIN + path, {
    ...init,
    headers: { Accept: 'application/json, text/event-stream', ...init.headers },
    signal: AbortSignal.timeout(12000),
    redirect: 'error',
  });
  if (!res.ok) throw new Error('http_status_' + res.status);
  return { data: rpcMessage(await res.text()), contentType:res.headers.get('content-type')||'' };
}
export async function runFabricReadOnlyCanary({fetcher=fetch}={}) {
  const facts = {
    schema:'evercraft.fabric.mcp-public-external-canary.v1',
    origin:ORIGIN,
    transport_verified:false,
    tool_registry_verified:false,
    read_only_response_verified:false,
    yard_deployment_receipt_bound:false,
    production_ready:false,
    external_actions_performed:false,
    reasons:[],
  };
  try {
    const health = (await request(fetcher,'/health',{headers:{Accept:'application/json'}})).data;
    if (health.ok !== true || health.server !== 'evercraft-fabric' || health.read_only !== true)
      throw new Error('health_claim_invalid');
    facts.yard_deployment_receipt_bound = health.deployment_receipt_bound === true &&
      typeof health.deployment_receipt_ref === 'string' &&
      health.deployment_receipt_ref.trim().length > 0;
    const initialized = (await request(fetcher,'/mcp',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',
        params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'evercraft-public-readonly-canary',version:'1.0.0'}}}),
    })).data;
    if (initialized.id !== 1 || initialized.result?.protocolVersion !== '2025-03-26' ||
        initialized.result?.serverInfo?.name !== 'evercraft-fabric')
      throw new Error('initialize_not_verified');
    facts.transport_verified=true;
    const listed = (await request(fetcher,'/mcp',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/list',params:{}}),
    })).data;
    const tools = listed.result?.tools;
    if (!Array.isArray(tools) || tools.length !== 3 ||
        REQUIRED_TOOLS.some(key => !tools.some(t => t.name === key && t.annotations?.readOnlyHint === true)))
      throw new Error('read_only_tool_registry_not_verified');
    facts.tool_registry_verified=true;
    const matched = (await request(fetcher,'/mcp',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({jsonrpc:'2.0',id:3,method:'tools/call',
        params:{name:'match_evercraft_capability',arguments:{
          intent:'I have a long video that exceeds AI upload limits and I need timestamps and a transcript',limit:1,
        }}}),
    })).data;
    const text = matched.result?.content?.find(item=>item.type==='text')?.text;
    const result = JSON.parse(text||'null');
    if(result?.ok!==true||!Array.isArray(result.matches)||
       !result.matches.some(m=>m.public_id==='forensiscope-evidence-review-v1' &&
           m.state==='discovery_only' && m.commercial_state==='verification_required'))
      throw new Error('non_disputed_read_only_match_not_verified');
    facts.read_only_response_verified=true;
  }catch(err){facts.reasons.push(String(err?.message||err).slice(0,160));}
  if (!facts.yard_deployment_receipt_bound) facts.reasons.push('yard_deployment_receipt_unbound');
  facts.production_ready =
    facts.transport_verified && facts.tool_registry_verified &&
    facts.read_only_response_verified && facts.yard_deployment_receipt_bound;
  return facts;
}
if(process.argv[1] && import.meta.url===new URL('file://'+process.argv[1]).href){
  const facts = await runFabricReadOnlyCanary();
  process.stdout.write(JSON.stringify(facts,null,2)+'\n');
  if(!facts.production_ready)process.exitCode=2;
}
