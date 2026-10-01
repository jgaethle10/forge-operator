import { output as capabilityRegistry } from './build-registry.mjs';

const PUBLIC_KINDS = new Set(['product','platform','media_system','research_system']);
const UNIVERSAL_FABRIC = 'https://fabric.systemiacommandcenters.com/mcp';

function safeHttps(value){
  try{
    const url=new URL(String(value||''));
    if(url.protocol!=='https:' || url.username || url.password) return null;
    return url.toString();
  }catch{
    return null;
  }
}

function docsUrl(row){
  const llms=(row.source_refs||[]).find((ref)=>/^public\/chum\/products\/[^/]+\/llms\.txt$/.test(ref));
  if(!llms) return null;
  return 'https://raw.githubusercontent.com/jgaethle10/forge-operator/main/'+llms;
}

export function registryFabricEntries(registry=capabilityRegistry){
  const rows=Array.isArray(registry?.entries)?registry.entries:[];
  return rows
    .filter((row)=>
      row?.public_safe===true &&
      PUBLIC_KINDS.has(String(row.kind||'')) &&
      Array.isArray(row.problem_language) &&
      row.problem_language.length>0
    )
    .map((row)=>{
      const connections=[];
      const legacyMachine=(row.blockers||[]).includes('legacy_base44_machine_endpoint_dependency');
      const machine=safeHttps(row.machine_endpoint);
      if(machine && !legacyMachine && machine!==UNIVERSAL_FABRIC){
        connections.push({
          type:'mcp',
          label:String(row.name||row.stable_id)+' specialist',
          url:machine,
          state:String(row.machine_endpoint_state||'declared_unverified'),
        });
      }
      connections.push({
        type:'mcp',
        label:'Evercraft universal MCP',
        url:UNIVERSAL_FABRIC,
        state:'fallback_declared_runtime_health_required',
      });
      const human=safeHttps(row.human_url);
      if(human){
        connections.push({
          type:'website',
          label:String(row.name||row.stable_id)+' human surface',
          url:human,
          state:String(row.human_handoff?.state||'public'),
        });
      }
      const docs=docsUrl(row);
      if(docs){
        connections.push({
          type:'docs',
          label:String(row.name||row.stable_id)+' LLM guide',
          url:docs,
          state:'public',
        });
      }

      const blockers=Array.isArray(row.blockers)?row.blockers:[];
      const state=blockers.length
        ? 'conversion_debt:'+blockers.slice(0,4).join(',')
        : String(row.invocation_state||'declared');

      return {
        public_id:row.stable_id,
        name:row.name,
        description:row.problem_language.slice(0,4).join('; '),
        keywords:row.problem_language.slice(0,32),
        state,
        category:row.class||row.kind||null,
        start_url_state:row.human_handoff?.state||null,
        preferred_agent_route:legacyMachine?'universal_fallback_legacy_specialist_held':(row.invocation_state||null),
        connections,
      };
    })
    .sort((a,b)=>a.public_id.localeCompare(b.public_id));
}
