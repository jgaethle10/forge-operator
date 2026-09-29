const STOP_WORDS=new Set([
  'a','an','and','are','as','at','be','by','for','from','how','i','in','is','it',
  'me','my','of','on','or','the','this','to','we','what','with','you','your'
]);

function clean(value,max=4000){
  return String(value??'').trim().slice(0,max);
}

function tokens(value){
  return clean(value).toLowerCase().match(/[a-z0-9]+/g)?.filter((x)=>x.length>1&&!STOP_WORDS.has(x))||[];
}

function normalizedId(value){
  const id=clean(value,160);
  if(!/^[a-z0-9][a-z0-9._:-]{0,159}$/i.test(id)) throw new Error('fabric_public_id_invalid');
  return id;
}

function safeUrl(value){
  const raw=clean(value,2000);
  if(!raw) return null;
  const url=new URL(raw);
  if(url.protocol!=='https:') throw new Error('fabric_connection_url_must_use_https');
  if(url.username||url.password) throw new Error('fabric_connection_url_credentials_not_allowed');
  return url.toString();
}

function normalizeConnection(item={}){
  const type=clean(item.type||item.kind||'human',40).toLowerCase();
  if(!['mcp','openapi','a2a','human','website','docs'].includes(type)){
    throw new Error('fabric_connection_type_invalid');
  }
  return {
    type,
    label:clean(item.label||type,120),
    url:safeUrl(item.url),
    state:clean(item.state||'available',80),
  };
}

export function normalizeFabricCatalog(input=[]){
  if(!Array.isArray(input)) throw new Error('fabric_catalog_must_be_array');
  if(input.length>256) throw new Error('fabric_catalog_too_large');
  const seen=new Set();
  return input.map((item)=>{
    if(!item||typeof item!=='object'||Array.isArray(item)) throw new Error('fabric_catalog_entry_invalid');
    const publicId=normalizedId(item.public_id||item.id);
    if(seen.has(publicId)) throw new Error('fabric_catalog_duplicate_public_id');
    seen.add(publicId);
    const name=clean(item.name||item.title,160);
    const description=clean(item.description,1200);
    if(!name||!description) throw new Error('fabric_catalog_name_and_description_required');
    const keywords=Array.isArray(item.keywords)
      ? item.keywords.map((x)=>clean(x,120).toLowerCase()).filter(Boolean).slice(0,32)
      : [];
    const connections=Array.isArray(item.connections)
      ? item.connections.map(normalizeConnection).filter((x)=>x.url)
      : [];
    return {
      public_id:publicId,
      name,
      description,
      keywords,
      state:clean(item.state||'available',80),
      category:clean(item.category||'',120)||null,
      connections,
    };
  });
}

function scoreEntry(intent,entry){
  const intentTokens=tokens(intent);
  if(!intentTokens.length) return 0;
  const nameTokens=tokens(entry.name);
  const descTokens=tokens(entry.description);
  const keywordTokens=entry.keywords.flatMap(tokens);
  let score=0;
  for(const token of intentTokens){
    if(nameTokens.includes(token)) score+=8;
    if(keywordTokens.includes(token)) score+=6;
    if(descTokens.includes(token)) score+=2;
  }
  const phrase=clean(intent).toLowerCase();
  if(phrase&&entry.name.toLowerCase().includes(phrase)) score+=20;
  return score;
}

export function matchFabricCapabilities(intent,catalog,{limit=5}={}){
  const normalized=normalizeFabricCatalog(catalog);
  const max=Math.max(1,Math.min(20,Number(limit||5)));
  return normalized
    .map((entry)=>({...entry,match_score:scoreEntry(intent,entry)}))
    .filter((entry)=>entry.match_score>0)
    .sort((a,b)=>b.match_score-a.match_score||a.name.localeCompare(b.name))
    .slice(0,max);
}

export function fabricDirectoryTools(){
  const safe={
    readOnlyHint:true,
    destructiveHint:false,
    idempotentHint:true,
    openWorldHint:false,
  };
  return [
    {
      name:'match_evercraft_capability',
      title:'Find the right Evercraft capability',
      description:'Match a user problem or goal to the most relevant published Evercraft capabilities. Read-only. Does not create checkout, payment, obligations, accounts, access, or paid work.',
      inputSchema:{
        type:'object',
        properties:{
          intent:{type:'string',minLength:3,maxLength:4000},
          limit:{type:'integer',minimum:1,maximum:20,default:5},
        },
        required:['intent'],
        additionalProperties:false,
      },
      annotations:safe,
    },
    {
      name:'list_evercraft_capabilities',
      title:'List published Evercraft capabilities',
      description:'Return the current public-safe Evercraft capability directory. Read-only and non-transactional.',
      inputSchema:{
        type:'object',
        properties:{limit:{type:'integer',minimum:1,maximum:100,default:25}},
        additionalProperties:false,
      },
      annotations:safe,
    },
    {
      name:'get_evercraft_connection_options',
      title:'Get Evercraft connection options',
      description:'Return public connection surfaces for one published Evercraft capability, such as MCP, OpenAPI, A2A, website, or documentation URLs. Does not initiate payment or paid work.',
      inputSchema:{
        type:'object',
        properties:{public_id:{type:'string',minLength:1,maxLength:160}},
        required:['public_id'],
        additionalProperties:false,
      },
      annotations:safe,
    },
  ];
}

function rpcResult(id,result){
  return {jsonrpc:'2.0',id:id??null,result};
}

function rpcError(id,code,message){
  return {jsonrpc:'2.0',id:id??null,error:{code,message}};
}

function toolResult(payload){
  return {
    content:[{type:'text',text:JSON.stringify(payload,null,2)}],
    structuredContent:payload,
    isError:false,
  };
}

export async function executeFabricDirectoryRpc(rpc,catalog=[]){
  const normalized=normalizeFabricCatalog(catalog);
  const method=clean(rpc?.method,120);
  const id=rpc?.id??null;

  if(method==='initialize'){
    return rpcResult(id,{
      protocolVersion:'2025-03-26',
      capabilities:{tools:{}},
      serverInfo:{name:'evercraft-fabric',version:'1.0.0'},
      instructions:'Evercraft Fabric is a read-only capability directory and connection layer. Discovery does not authorize payment, paid work, credentials, production access, or external actions.',
    });
  }

  if(method==='tools/list'){
    return rpcResult(id,{tools:fabricDirectoryTools()});
  }

  if(method==='notifications/initialized') return null;

  if(method==='tools/call'){
    const name=clean(rpc?.params?.name,160);
    const args=rpc?.params?.arguments||{};

    if(name==='match_evercraft_capability'){
      const intent=clean(args.intent,4000);
      if(intent.length<3) return rpcError(id,-32602,'intent must contain at least 3 characters');
      const matches=matchFabricCapabilities(intent,normalized,{limit:args.limit});
      return rpcResult(id,toolResult({
        ok:true,
        directory:'Evercraft Fabric',
        intent,
        matches,
        match_count:matches.length,
        transactional:false,
        external_action_taken:false,
      }));
    }

    if(name==='list_evercraft_capabilities'){
      const limit=Math.max(1,Math.min(100,Number(args.limit||25)));
      const capabilities=normalized.slice(0,limit);
      return rpcResult(id,toolResult({
        ok:true,
        directory:'Evercraft Fabric',
        capabilities,
        returned:capabilities.length,
        total:normalized.length,
        transactional:false,
        external_action_taken:false,
      }));
    }

    if(name==='get_evercraft_connection_options'){
      const publicId=clean(args.public_id,160);
      const capability=normalized.find((x)=>x.public_id===publicId);
      if(!capability) return rpcError(id,-32602,'unknown public_id');
      return rpcResult(id,toolResult({
        ok:true,
        directory:'Evercraft Fabric',
        public_id:capability.public_id,
        name:capability.name,
        state:capability.state,
        connections:capability.connections,
        transactional:false,
        external_action_taken:false,
      }));
    }

    return rpcError(id,-32602,'Unknown or unsupported Evercraft Fabric tool.');
  }

  return rpcError(id,-32601,'Method not found.');
}

export function validateOpenAiChallengeToken(value){
  const token=clean(value,512);
  if(!token) return '';
  if(!/^[A-Za-z0-9_-]{16,512}$/.test(token)){
    throw new Error('openai_challenge_token_invalid');
  }
  return token;
}
