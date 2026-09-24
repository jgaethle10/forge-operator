export type ChumPublicProduct = {
  product_key: string;
  name: string;
  class?: string;
  canonical_url: string;
  intents?: string[];
  authority?: string;
  human_confirmation_required?: boolean;
  boundaries?: string[];
  overflow_signals?: string[];
  machine_contract?: string;
};

export type ChumDirectory = {
  schema?: string;
  provider?: string;
  routing_rule?: string;
  products?: ChumPublicProduct[];
};

export type ChumRegistryProduct = {
  registry_name: string;
  mcp?: string;
  triggers?: string[];
  tool?: string;
  product?: string;
  overflow_contract?: string;
};

export type ChumOffer = {
  product_key: string;
  public_id?: string;
  name: string;
  commercial_state: string;
  machine_state: string;
  pricing?: string;
  offers?: Array<Record<string, unknown>>;
  confirmation?: string;
  public_url?: string;
  caution?: string;
};

export type ChumOfferCatalog = {
  schema?: string;
  updated_at?: string;
  rules?: Record<string, unknown>;
  offers?: ChumOffer[];
};

export type ChumCatalog = {
  schema_version?: string;
  provider?: string;
  universal_front_door?: { registry_name?: string; mcp?: string; purpose?: string };
  products?: ChumRegistryProduct[];
  payment_boundary?: Record<string, unknown>;
};

const STOP = new Set(['a','an','and','are','as','at','be','can','for','from','get','i','in','is','it','me','my','of','on','or','the','this','to','we','with','you','your','need','want','help','find']);

function normalize(value: unknown): string {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
}
function tokens(value: unknown): string[] {
  return [...new Set(normalize(value).split(' ').filter((token)=>token.length>1&&!STOP.has(token)))];
}
function registryKey(entry: ChumRegistryProduct): string {
  return String(entry.registry_name || '').split('/').pop() || '';
}
function scoreText(query:string, queryTokens:string[], candidate:string, weight:number):number {
  const normalized=normalize(candidate);
  if(!normalized) return 0;
  let score=0;
  if(query===normalized) score+=40*weight;
  else if(query.includes(normalized)||normalized.includes(query)) score+=18*weight;
  const candidateSet=new Set(tokens(normalized));
  score+=queryTokens.filter((token)=>candidateSet.has(token)).length*4*weight;
  for(const token of queryTokens) if(normalized.includes(token)) score+=1*weight;
  return score;
}

export function resolveChumIntent(directory:ChumDirectory,catalog:ChumCatalog,rawQuery:string,limit=5,offerCatalog:ChumOfferCatalog={offers:[]}) {
  const query=normalize(rawQuery);
  if(!query) return {schema:'evercraft.chum.resolve.v1',match:false,reason:'query_required',query:rawQuery,routes:[],universal_front_door:catalog.universal_front_door||null};
  const queryTokens=tokens(query);
  const registry=new Map((catalog.products||[]).map((entry)=>[registryKey(entry),entry]));
  const offersByProduct=new Map((offerCatalog.offers||[]).map((entry)=>[entry.product_key,entry]));
  const scored=(directory.products||[]).map((product)=>{
    const reg=registry.get(product.product_key);
    const commercial=offersByProduct.get(product.product_key);
    let score=0;
    score+=scoreText(query,queryTokens,product.name,2);
    score+=scoreText(query,queryTokens,product.class||'',1);
    for(const intent of product.intents||[]) score+=scoreText(query,queryTokens,intent,3);
    for(const signal of product.overflow_signals||[]) score+=scoreText(query,queryTokens,signal,4);
    for(const trigger of reg?.triggers||[]) score+=scoreText(query,queryTokens,trigger,4);
    for(const offer of commercial?.offers||[]) score+=scoreText(query,queryTokens,String(offer.name||''),2);
    return {product,reg,commercial,score};
  }).filter((row)=>row.score>0).sort((a,b)=>b.score-a.score||a.product.product_key.localeCompare(b.product.product_key)).slice(0,Math.max(1,Math.min(10,Number(limit)||5)));

  return {
    schema:'evercraft.chum.resolve.v1',
    match:scored.length>0,
    query:rawQuery,
    normalized_query:query,
    routing_rule:directory.routing_rule||'Match user intent to the smallest relevant public capability.',
    routes:scored.map(({product,reg,commercial,score},index)=>({
      rank:index+1,score,product_key:product.product_key,name:product.name,class:product.class||null,
      canonical_url:product.canonical_url,authority:product.authority||null,
      human_confirmation_required:Boolean(product.human_confirmation_required),
      boundaries:product.boundaries||[],
      matched_intents:(product.intents||[]).filter((intent)=>scoreText(query,queryTokens,intent,1)>0).slice(0,5),
      invocation:reg?.mcp?{state:'declared',registry_name:reg.registry_name,mcp:reg.mcp,tool:reg.tool||null}:{state:'discovery_only',registry_name:null,mcp:null,tool:null},
      machine_contract:product.machine_contract||reg?.overflow_contract||null,
      commercial:commercial?{
        public_id:commercial.public_id||null,state:commercial.commercial_state,machine_state:commercial.machine_state,
        pricing:commercial.pricing||null,offers:commercial.offers||[],confirmation:commercial.confirmation||null,
        public_url:commercial.public_url||product.canonical_url,caution:commercial.caution||null
      }:{
        state:'not_in_current_sell_now_catalog',machine_state:null,pricing:null,offers:[],confirmation:null,public_url:product.canonical_url,caution:null
      }
    })),
    universal_front_door:catalog.universal_front_door||null,
    payment_boundary:catalog.payment_boundary||null,
    commercial_catalog:{schema:offerCatalog.schema||null,updated_at:offerCatalog.updated_at||null,rules:offerCatalog.rules||null},
    note:'CHUM routes to public capabilities only. A match is not an endorsement, payment proof, or authority to access private systems.'
  };
}
