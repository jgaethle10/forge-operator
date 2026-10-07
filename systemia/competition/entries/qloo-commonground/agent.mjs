import { createHash } from "node:crypto";

const DEFAULT_BASE_URL="https://hackathon.api.qloo.com/v2";
const CATEGORY_TYPES=Object.freeze({
  place:"urn:entity:place",
  destination:"urn:entity:destination",
  movie:"urn:entity:movie",
  tv:"urn:entity:tv_show",
  artist:"urn:entity:artist",
  brand:"urn:entity:brand",
  book:"urn:entity:book",
  videogame:"urn:entity:videogame",
});
const LOCATION_CATEGORIES=new Set(["place","destination"]);

function clean(value,max=160){
  return String(value??"").replace(/\s+/g," ").trim().slice(0,max);
}
function uniq(values){
  return [...new Set((values||[]).map((x)=>clean(x)).filter(Boolean))];
}
function clamp(value,min,max,fallback){
  const n=Number(value);
  return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;
}
function receiptHash(value){
  return "sha256:"+createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function categoriesForObjective(objective=""){
  const text=clean(objective,500).toLowerCase();
  if(/date|night out|anniversary|evening/.test(text)) return ["place","movie","artist"];
  if(/trip|travel|vacation|weekend|visit/.test(text)) return ["destination","place","artist"];
  if(/gift|style|fashion|shop/.test(text)) return ["brand","book","artist"];
  if(/watch|movie|film|tv|show/.test(text)) return ["movie","tv","place"];
  if(/music|concert|playlist|artist/.test(text)) return ["artist","place","movie"];
  if(/family|kids|friends|group|outing/.test(text)) return ["place","movie","artist"];
  return ["place","movie","artist"];
}

export function normalizeCommonGroundRequest(input={}){
  if(!input||typeof input!=="object"||Array.isArray(input)) throw new Error("request_object_required");
  const rawProfiles=Array.isArray(input.profiles)?input.profiles:[];
  if(rawProfiles.length<2) throw new Error("at_least_two_profiles_required");
  if(rawProfiles.length>4) throw new Error("maximum_four_profiles");

  const profiles=rawProfiles.map((row,index)=>{
    const interests=uniq(Array.isArray(row?.interests)?row.interests:[]).slice(0,5);
    if(!interests.length) throw new Error(`profile_${index+1}_interest_required`);
    return {
      profile_id:`profile-${index+1}`,
      label:clean(row?.label,40)||`Person ${index+1}`,
      interests,
    };
  });

  const requestedCategories=uniq(
    Array.isArray(input.categories)&&input.categories.length
      ? input.categories
      : categoriesForObjective(input.objective)
  ).map((x)=>x.toLowerCase());
  const categories=requestedCategories.filter((x)=>CATEGORY_TYPES[x]).slice(0,3);
  if(!categories.length) throw new Error("supported_category_required");

  const location=clean(input.location,120);
  const objective=clean(input.objective,500);
  const take=Math.round(clamp(input.take,3,10,8));
  const priceLevelMax=input.price_level_max==null
    ? null
    : Math.round(clamp(input.price_level_max,1,4,4));

  return {
    profiles,
    categories,
    location,
    objective,
    take,
    price_level_max:priceLevelMax,
  };
}

function extractEntities(payload={}){
  if(Array.isArray(payload?.results?.entities)) return payload.results.entities;
  if(Array.isArray(payload?.results)) return payload.results;
  if(Array.isArray(payload?.entities)) return payload.entities;
  return [];
}

function entityId(entity={}){
  return clean(
    entity.entity_id||
    entity.id||
    entity.entityId||
    entity.urn||
    "",
    220
  );
}
function entityName(entity={}){
  return clean(
    entity.name||
    entity.title||
    entity.properties?.name||
    entity.properties?.title||
    "",
    220
  );
}
function affinity(entity={}){
  const values=[
    entity.affinity,
    entity.score,
    entity.query?.affinity,
    entity.properties?.affinity,
  ];
  for(const value of values){
    const n=Number(value);
    if(Number.isFinite(n)) return Math.max(0,Math.min(1,n));
  }
  return null;
}

function normalizeEntity(entity,rank){
  const name=entityName(entity);
  const id=entityId(entity);
  if(!name&&!id) return null;
  return {
    entity_id:id||null,
    name:name||id,
    type:clean(entity.type||entity.entity_type||"",120)||null,
    subtype:clean(entity.subtype||entity.entity_subtype||"",120)||null,
    rank,
    affinity:affinity(entity),
    properties:entity.properties&&typeof entity.properties==="object"
      ? entity.properties
      : {},
    explainability:entity.query?.explainability||entity.explainability||null,
  };
}

export async function queryQlooProfile({
  interests,
  category,
  location="",
  priceLevelMax=null,
  take=8,
}={},{
  fetchImpl=globalThis.fetch,
  apiKey=process.env.QLOO_API_KEY||"",
  baseUrl=process.env.QLOO_API_BASE_URL||DEFAULT_BASE_URL,
  timeoutMs=12_000,
}={}){
  if(typeof fetchImpl!=="function") throw new Error("fetch_required");
  if(!clean(apiKey,1000)) throw new Error("qloo_api_key_missing");
  const filterType=CATEGORY_TYPES[category];
  if(!filterType) throw new Error("unsupported_qloo_category");

  const body={
    "filter.type":filterType,
    "signal.interests.entities.query":uniq(interests).slice(0,5),
    "feature.explainability":true,
    "take":Math.round(clamp(take,1,10,8)),
  };
  if(location&&LOCATION_CATEGORIES.has(category)){
    body["filter.location.query"]=clean(location,120);
  }
  if(category==="place"&&priceLevelMax!=null){
    body["filter.price_level.max"]=Math.round(clamp(priceLevelMax,1,4,4));
  }

  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),Math.max(1000,Number(timeoutMs||12_000)));
  try{
    const response=await fetchImpl(String(baseUrl).replace(/\/$/,"")+"/insights",{
      method:"POST",
      headers:{
        accept:"application/json",
        "content-type":"application/json",
        "x-api-key":String(apiKey),
      },
      body:JSON.stringify(body),
      signal:controller.signal,
    });
    const text=await response.text();
    let payload={};
    try{payload=text?JSON.parse(text):{};}catch{payload={};}
    if(!response.ok){
      const detail=clean(
        payload?.message||
        payload?.error?.message||
        payload?.error||
        text||
        `HTTP ${response.status}`,
        240
      );
      const error=new Error(`qloo_http_${response.status}:${detail}`);
      error.status=response.status;
      throw error;
    }
    const entities=extractEntities(payload)
      .map((entity,index)=>normalizeEntity(entity,index+1))
      .filter(Boolean);
    return {
      category,
      filter_type:filterType,
      entities,
      provider_duration_ms:Number(payload?.results?.duration||payload?.duration)||null,
      provider_success:payload?.success!==false,
      query_explainability:payload?.query?.explainability||null,
    };
  }finally{
    clearTimeout(timer);
  }
}

function consensusKey(entity){
  return entity.entity_id
    ? "id:"+entity.entity_id
    : "name:"+String(entity.name||"").toLowerCase();
}

export function buildConsensus(profileResults=[],profileCount=0){
  const totalProfiles=Math.max(1,Number(profileCount||0));
  const map=new Map();
  for(const row of profileResults){
    for(const entity of row.entities||[]){
      const key=consensusKey(entity);
      if(!key||key==="name:") continue;
      let item=map.get(key);
      if(!item){
        item={
          entity_id:entity.entity_id,
          name:entity.name,
          type:entity.type,
          subtype:entity.subtype,
          properties:entity.properties,
          explainability:entity.explainability,
          appearances:0,
          profile_scores:[],
        };
        map.set(key,item);
      }
      const rankScore=1/Math.max(1,entity.rank);
      const affinityScore=entity.affinity==null?rankScore:entity.affinity;
      const blended=(0.72*rankScore)+(0.28*affinityScore);
      item.appearances+=1;
      item.profile_scores.push({
        profile_id:row.profile_id,
        rank:entity.rank,
        affinity:entity.affinity,
        score:Number(blended.toFixed(6)),
      });
    }
  }

  return [...map.values()]
    .map((item)=>{
      const scoreSum=item.profile_scores.reduce((sum,row)=>sum+row.score,0);
      const coverage=item.appearances/totalProfiles;
      const consensus=(scoreSum/totalProfiles)*(0.65+0.35*coverage);
      return {
        ...item,
        coverage:Number(coverage.toFixed(4)),
        consensus_score:Number(consensus.toFixed(6)),
      };
    })
    .sort((a,b)=>
      b.consensus_score-a.consensus_score||
      b.coverage-a.coverage||
      a.name.localeCompare(b.name)
    );
}

export async function runCommonGroundAgent(input={},options={}){
  const request=normalizeCommonGroundRequest(input);
  const startedAt=new Date().toISOString();
  const rows=[];

  for(const category of request.categories){
    const perProfile=await Promise.all(
      request.profiles.map(async(profile)=>{
        const result=await queryQlooProfile({
          interests:profile.interests,
          category,
          location:request.location,
          priceLevelMax:request.price_level_max,
          take:request.take,
        },options);
        return {
          profile_id:profile.profile_id,
          category,
          entities:result.entities,
          provider_duration_ms:result.provider_duration_ms,
          query_explainability:result.query_explainability,
        };
      })
    );
    const consensus=buildConsensus(perProfile,request.profiles.length).slice(0,8);
    rows.push({
      category,
      recommendations:consensus,
      top_pick:consensus[0]||null,
      provider_calls:perProfile.length,
    });
  }

  const body={
    schema:"evercraft.competition.qloo-commonground.v1",
    competition:"qloo-agentic-hackathon-2026",
    product:"CommonGround",
    state:"provider_grounded",
    provider:"Qloo",
    provider_evidence_state:"live_api_response",
    objective:request.objective||null,
    location:request.location||null,
    categories:request.categories,
    profiles:request.profiles.map((p)=>({
      profile_id:p.profile_id,
      label:p.label,
      interest_count:p.interests.length,
    })),
    results:rows,
    plan:rows.map((row)=>({
      category:row.category,
      pick:row.top_pick?{
        entity_id:row.top_pick.entity_id,
        name:row.top_pick.name,
        consensus_score:row.top_pick.consensus_score,
        coverage:row.top_pick.coverage,
      }:null,
    })),
    agent_trace:[
      "normalize_group_preferences",
      "select_cross_domain_categories",
      "query_qloo_per_profile",
      "rank_each_profile",
      "compute_group_consensus",
      "emit_explainable_plan",
    ],
    privacy:{
      identity_required:false,
      profile_names_sent_to_qloo:false,
      raw_interests_persisted:false,
      qloo_key_exposed:false,
    },
    authority:{
      external_action_taken:false,
      reservation_or_purchase_authority:false,
      payment_authority:false,
    },
    started_at:startedAt,
    completed_at:new Date().toISOString(),
  };
  return {...body,receipt_hash:receiptHash(body)};
}

export function commonGroundHealth({
  apiKey=process.env.QLOO_API_KEY||"",
  baseUrl=process.env.QLOO_API_BASE_URL||DEFAULT_BASE_URL,
}={}){
  return {
    schema:"evercraft.competition.qloo-commonground-health.v1",
    ok:true,
    qloo_configured:Boolean(clean(apiKey,1000)),
    qloo_base_url:String(baseUrl).replace(/\/$/,""),
    competition:"qloo-agentic-hackathon-2026",
    external_action_authority:false,
  };
}
