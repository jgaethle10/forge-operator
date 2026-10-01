import fs from 'node:fs';
import path from 'node:path';
import { previewPublicWebsite } from './public-website-preview.mjs';
import { fileURLToPath } from 'node:url';

const STOP_WORDS=new Set([
  'a','an','and','are','as','at','be','by','for','from','how','i','in','is','it',
  'me','my','of','on','or','the','this','to','we','what','with','you','your',
  'can','cannot','cant','could','need','needs','please','trying','want','wants',
  'help','helps','through','normal','have','has','had','but','not','know','see','take','old','original','some','thing','things'
]);

function clean(value,max=4000){
  return String(value??'').trim().slice(0,max);
}

function stemToken(token){
  let value=String(token||'').toLowerCase();
  if(value.length>5&&value.endsWith('ies')) value=value.slice(0,-3)+'y';
  else if(value.length>5&&value.endsWith('ing')) value=value.slice(0,-3);
  else if(value.length>4&&value.endsWith('ed')) value=value.slice(0,-2);
  else if(value.length>4&&value.endsWith('es')) value=value.slice(0,-2);
  else if(value.length>3&&value.endsWith('s')) value=value.slice(0,-1);
  return value;
}

function tokens(value){
  return clean(value).toLowerCase().match(/[a-z0-9]+/g)
    ?.map(stemToken)
    .filter((x)=>x.length>1&&!STOP_WORDS.has(x))||[];
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

function normalizeUseWhen(value){
  if(!Array.isArray(value)) return [];
  return value.map((item)=>clean(item,180)).filter(Boolean).slice(0,16);
}

function normalizeEntryPaidOffer(value){
  if(!value||typeof value!=='object'||Array.isArray(value)) return null;
  const name=clean(value.name,180);
  if(!name) return null;
  const normalizedPrice=Number(value.price_usd_normalized ?? value.price_usd);
  return {
    name,
    price:clean(value.price,80)||null,
    price_usd_normalized:Number.isFinite(normalizedPrice)?normalizedPrice:null,
    billing:clean(value.billing,80)||null,
    fulfillment:clean(value.fulfillment,120)||null,
    scope:clean(value.scope,600)||null,
  };
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

export function loadFabricCatalogFromRepository({catalogPath=''}={}){
  const moduleDir=path.dirname(fileURLToPath(import.meta.url));
  const resolved=catalogPath
    ? path.resolve(catalogPath)
    : path.resolve(moduleDir,'../../public/chum/capabilities.json');
  if(!fs.existsSync(resolved)) throw new Error('fabric_catalog_source_missing');
  const source=JSON.parse(fs.readFileSync(resolved,'utf8'));
  const rows=Array.isArray(source?.capabilities)?source.capabilities:[];
  const universalMcp=safeUrl(source?.universal_mcp||'');
  const mapped=rows.map((item)=>{
    const connections=[];
    const direct=item?.direct_specialist;
    if(
      direct &&
      String(direct.registry_state||'').toLowerCase()==='published' &&
      direct.mcp
    ){
      connections.push({
        type:'mcp',
        label:clean(direct.product||item.name||'Evercraft specialist',120),
        url:direct.mcp,
        state:clean(direct.route_state||'available',80),
      });
    }
    if(universalMcp && !connections.some((x)=>x.url===universalMcp)){
      connections.push({
        type:'mcp',
        label:'Evercraft universal MCP',
        url:universalMcp,
        state:'fallback_available',
      });
    }
    const ownedCapabilityUrl='https://fabric.systemiacommandcenters.com/capabilities/'+encodeURIComponent(String(item.public_id||''));
    connections.push({
      type:'website',
      label:clean((item.name||'Evercraft')+' owned public surface',120),
      url:ownedCapabilityUrl,
      state:'public',
    });
    if(item.llms_url){
      connections.push({
        type:'docs',
        label:clean((item.name||'Evercraft')+' LLM guide',120),
        url:item.llms_url,
        state:'public',
      });
    }
    return {
      public_id:item.public_id,
      name:item.name,
      description:clean(
        item.problem ||
        (Array.isArray(item.use_when)?item.use_when.join('; '):'') ||
        item.invocation_status ||
        item.pricing ||
        'Evercraft public capability.',
        1200
      ),
      keywords:[
        ...(Array.isArray(item.intent_terms)?item.intent_terms:[]),
        ...(Array.isArray(item.use_when)?item.use_when:[]),
      ].slice(0,32),
      state:clean(item.machine_state||item.commercial_state||'available',80),
      commercial_state:clean(item.commercial_state||'',80)||null,
      category:clean(item.category||'',120)||null,
      pricing:clean(item.pricing||'',900)||null,
      use_when:normalizeUseWhen(item.use_when),
      entry_paid_offer:normalizeEntryPaidOffer(item.entry_paid_offer),
      start_url_state:clean(item.start_url_state||'',120)||null,
      preferred_agent_route:clean(item.preferred_agent_route||'',120)||null,
      connections,
    };
  });
  return normalizeFabricCatalog(mapped);
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
      commercial_state:clean(item.commercial_state||'',80)||null,
      category:clean(item.category||'',120)||null,
      pricing:clean(item.pricing||'',900)||null,
      use_when:normalizeUseWhen(item.use_when),
      entry_paid_offer:normalizeEntryPaidOffer(item.entry_paid_offer),
      start_url_state:clean(item.start_url_state||'',120)||null,
      preferred_agent_route:clean(item.preferred_agent_route||'',120)||null,
      connections,
    };
  });
}

function entryTokenSet(entry){
  return new Set([
    ...tokens(entry.name),
    ...tokens(entry.description),
    ...entry.keywords.flatMap(tokens),
  ]);
}

function buildDocumentFrequency(catalog){
  const frequency=new Map();
  for(const entry of catalog){
    for(const token of entryTokenSet(entry)){
      frequency.set(token,(frequency.get(token)||0)+1);
    }
  }
  return frequency;
}

function tokenWeight(token,frequency,total){
  const df=frequency.get(token)||0;
  return 1+Math.log((total+1)/(df+1));
}

function scoreEntry(intent,entry,{frequency,total}){
  const intentTokens=[...new Set(tokens(intent))];
  if(!intentTokens.length) return 0;
  const nameTokens=new Set(tokens(entry.name));
  const descTokens=new Set(tokens(entry.description));
  const keywordTokens=new Set(entry.keywords.flatMap(tokens));
  let score=0;
  for(const token of intentTokens){
    const weight=tokenWeight(token,frequency,total);
    if(nameTokens.has(token)) score+=8*weight;
    if(keywordTokens.has(token)) score+=6*weight;
    if(descTokens.has(token)) score+=2*weight;
  }

  const intentSet=new Set(intentTokens);
  for(const keyword of entry.keywords){
    const phraseTokens=[...new Set(tokens(keyword))];
    if(phraseTokens.length<2) continue;
    const overlap=phraseTokens.filter((token)=>intentSet.has(token));
    if(overlap.length>=2){
      const coverage=overlap.length/phraseTokens.length;
      score+=coverage*overlap.reduce(
        (sum,token)=>sum+(4*tokenWeight(token,frequency,total)),
        0
      );
    }
  }

  const phrase=clean(intent).toLowerCase();
  if(phrase&&entry.name.toLowerCase().includes(phrase)) score+=20;

  // Physical-part routing guardrails. Rare generic words such as "broken" must not
  // let software-health capabilities outrank a specialist when the user is holding
  // a real component, while deep sourcing language should still favor the paid hunt.
  const physicalSignals=['part','component','replacement','obsolete','discontinu','salvage','donor','supersession','cross','reference','serial','marking','label','fragment','fitment','fabrication','blueprint','appliance','tractor','machine'];
  const identitySignals=['identify','photo','marking','label','serial','fragment','diagram','invoice','evidence','model','number','measurement','call'];
  const deepSourceSignals=['obsolete','discontinu','salvage','donor','supersession','cross','reference','blueprint','fabrication','aftermarket','nos'];
  const softwareSignals=['software','app','repository','repo','codebase','website','endpoint','workflow','deployment','api','saas'];
  const hasPhysicalPartIntent=intentSet.has('part')||intentSet.has('component')||physicalSignals.filter((token)=>intentSet.has(token)).length>=2;
  const hasSoftwareIntent=softwareSignals.some((token)=>intentSet.has(token));

  if(entry.public_id==='findmypart-part-passport-v1'&&hasPhysicalPartIntent){
    score+=55;
    if(identitySignals.some((token)=>intentSet.has(token))) score+=45;
  }

  if(entry.public_id==='findmypart-paid-hunt-v1'&&hasPhysicalPartIntent){
    score+=40;
    if(deepSourceSignals.filter((token)=>intentSet.has(token)).length>=2) score+=55;
  }

  if(
    hasPhysicalPartIntent &&
    !hasSoftwareIntent &&
    ['portfolio-sentinel-v1','legacy-rescue-lab-v1','audit-center-website-audit-machine-v1'].includes(entry.public_id)
  ){
    score-=120;
  }

  return Math.max(0,Math.round(score*100)/100);
}

export function matchFabricCapabilities(intent,catalog,{limit=5}={}){
  const normalized=normalizeFabricCatalog(catalog);
  const max=Math.max(1,Math.min(20,Number(limit||5)));
  const frequency=buildDocumentFrequency(normalized);
  const total=normalized.length;
  return normalized
    .map((entry)=>({...entry,match_score:scoreEntry(intent,entry,{frequency,total})}))
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
  const publicWebSafe={
    readOnlyHint:true,
    destructiveHint:false,
    idempotentHint:true,
    openWorldHint:true,
  };
  return [
    {
      name:'match_evercraft_capability',
      title:'Find the right Evercraft capability',
      description:'Match a user problem or goal to the most relevant published Evercraft capabilities. Read-only. Does not create checkout, payment, obligations, accounts, access, or paid work.',
      inputSchema:{
        type:'object',
        properties:{
          intent:{type:'string',minLength:3,maxLength:4000,description:'Plain-language problem or goal to match against the published Evercraft capability catalog.'},
          limit:{type:'integer',minimum:1,maximum:20,default:5,description:'Maximum number of ranked capability matches to return.'},
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
        properties:{limit:{type:'integer',minimum:1,maximum:100,default:25,description:'Maximum number of published capabilities to return.'}},
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
        properties:{public_id:{type:'string',minLength:1,maxLength:160,description:'Exact public capability identifier returned by Evercraft capability matching or listing.'}},
        required:['public_id'],
        additionalProperties:false,
      },
      annotations:safe,
    },
    {
      name:'preview_public_website',
      title:'Preview a public website',
      description:'Fetch one user-supplied public website URL and return a bounded, evidence-backed preview of HTTP and on-page website signals. Read-only. Private and local networks, embedded credentials, oversized responses, and unsupported content types are rejected.',
      inputSchema:{
        type:'object',
        properties:{
          url:{type:'string',minLength:3,maxLength:2048,description:'Public http or https website URL to inspect. If the scheme is omitted, https is assumed.'},
        },
        required:['url'],
        additionalProperties:false,
      },
      annotations:publicWebSafe,
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

export async function executeFabricDirectoryRpc(rpc,catalog=[],{websitePreview=previewPublicWebsite}={}){
  const normalized=normalizeFabricCatalog(catalog);
  const method=clean(rpc?.method,120);
  const id=rpc?.id??null;

  if(method==='initialize'){
    return rpcResult(id,{
      protocolVersion:'2025-03-26',
      capabilities:{tools:{}},
      serverInfo:{name:'evercraft-fabric',version:'1.1.0'},
      instructions:'Evercraft Fabric provides read-only capability routing plus bounded standalone public-web inspection. Discovery and previews do not authorize payment, paid work, credentials, production access, or external actions.',
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

    if(name==='preview_public_website'){
      const url=clean(args.url,2048);
      if(url.length<3) return rpcError(id,-32602,'url must contain at least 3 characters');
      try{
        return rpcResult(id,toolResult(await websitePreview(url)));
      }catch(error){
        return rpcError(
          id,
          -32010,
          error instanceof Error?error.message:String(error)
        );
      }
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
