import fs from 'node:fs';
import path from 'node:path';
import { YardOperator } from '../yard/operator.mjs';
import { buildSabanComputeMarketStack } from './market-stack.mjs';

const uniq=(values)=>[...new Set((values||[]).map((value)=>String(value).trim()).filter(Boolean))];

function truthy(value){
  return ['1','true','yes','on'].includes(String(value||'').trim().toLowerCase());
}

function existingDir(values){
  for(const value of values){
    const resolved=String(value||'').trim();
    if(!resolved) continue;
    try{
      if(fs.statSync(resolved).isDirectory()) return path.resolve(resolved);
    }catch{}
  }
  return null;
}

export function discoverRemoteBrokerDeployment(stateDir){
  const root=String(stateDir||'').trim();
  if(!root) return null;
  let names=[];
  try{names=fs.readdirSync(root);}catch{return null;}

  const records=[];
  for(const name of names){
    if(!name.endsWith('.json')||name.startsWith('.')) continue;
    try{
      const record=JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));
      if(
        record?.state==='ready' &&
        record?.receipt?.workload_class==='systemia.remote-capacity-broker.v1' &&
        record?.deployment_id &&
        record?.result?.service_id
      ){
        records.push(record);
      }
    }catch{}
  }
  records.sort((a,b)=>String(b.updated_at||b.created_at||'').localeCompare(
    String(a.updated_at||a.created_at||'')
  ));
  return records[0]?.deployment_id||null;
}

function explicitAdapters(acquisition){
  return Array.isArray(acquisition?.adapters)
    ? acquisition.adapters.filter((adapter)=>adapter&&typeof adapter.discover==='function')
    : [];
}

function voluntaryControlHeaders(acquisition,env){
  if(acquisition.voluntary_control_headers&&typeof acquisition.voluntary_control_headers==='object'){
    return {...acquisition.voluntary_control_headers};
  }
  const token=String(
    acquisition.voluntary_control_token||
    env.EVERCRAFT_VOLUNTARY_CONTROL_TOKEN||
    ''
  ).trim();
  return token?{authorization:`Bearer ${token}`}:null;
}

export async function buildComputeMarketAdapters({
  acquisition={},
  env=process.env,
  cwd=process.cwd(),
}={}){
  const explicit=explicitAdapters(acquisition);
  const requested=new Set(uniq([
    ...(acquisition.markets||[]),
    ...(acquisition.adapter_specs||[]),
  ]).map((value)=>value.toLowerCase()));
  const automatic=acquisition.auto_discover_markets!==false;

  const yardStateDir=existingDir([
    acquisition.yard_state_dir,
    env.EVERCRAFT_YARD_STATE_DIR,
    env.SYSTEMIA_YARD_STATE_DIR,
    path.join(cwd,'artifacts','yard'),
    path.join(cwd,'artifacts','systemia-yard'),
  ]);
  const brokerDeploymentId=String(
    acquisition.broker_deployment_id||
    env.EVERCRAFT_REMOTE_CAPACITY_BROKER_DEPLOYMENT_ID||
    (yardStateDir?discoverRemoteBrokerDeployment(yardStateDir):'')||
    ''
  ).trim();
  const yard=yardStateDir?new YardOperator({stateDir:yardStateDir}):null;

  const voluntaryEndpoint=String(
    acquisition.voluntary_endpoint||
    env.EVERCRAFT_VOLUNTARY_COMPUTE_ENDPOINT||
    ''
  ).trim();

  const publicMarketDiscovery =
    acquisition.public_market_discovery===true ||
    truthy(env.SABAN_PUBLIC_MARKET_DISCOVERY);

  const includeAkash=
    requested.has('akash') ||
    (
      automatic &&
      (
        Boolean(String(env.AKASH_API_KEY||'').trim()) ||
        publicMarketDiscovery
      )
    );

  const includeGolem=
    requested.has('golem') ||
    acquisition.include_golem===true ||
    truthy(env.SABAN_GOLEM_DISCOVERY);

  const wantBroker=
    requested.has('evercraft-broker') ||
    requested.has('evercraft_broker') ||
    (automatic&&Boolean(yard&&brokerDeploymentId));

  const wantVoluntary=
    requested.has('evercraft-voluntary') ||
    requested.has('evercraft_voluntary') ||
    (automatic&&Boolean(voluntaryEndpoint));

  const stack=await buildSabanComputeMarketStack({
    yard:wantBroker?yard:null,
    brokerDeploymentId:wantBroker?brokerDeploymentId:'',
    voluntaryEndpoint:wantVoluntary?voluntaryEndpoint:'',
    voluntaryControlHeaders:wantVoluntary?voluntaryControlHeaders(acquisition,env):null,
    includeAkash,
    akash:{
      apiKey:String(env.AKASH_API_KEY||''),
      baseUrl:acquisition.akash_base_url||env.AKASH_BASE_URL||'https://console-api.akash.network',
      quoteTimeoutMs:Number(acquisition.akash_quote_timeout_ms||45000),
    },
    includeGolem,
    golem:acquisition.golem||{},
  });

  const adapters=[];
  const seen=new Set();
  for(const adapter of [...explicit,...stack.adapters]){
    const market=String(adapter?.market||'unknown').toLowerCase();
    if(seen.has(market)) continue;
    seen.add(market);
    adapters.push(adapter);
  }

  const diagnostics=[
    ...stack.inventory.map((row)=>({
      market:row.market,
      state:row.configured?'ready':'unavailable',
      class:row.class,
      priority:row.priority,
      execution_capable:row.execution_capable,
      execution_hold:row.execution_hold||null,
      source:
        row.market==='evercraft-broker'?'yard':
        row.market==='evercraft-voluntary'?'voluntary_exchange':
        row.market==='akash'
          ? (String(env.AKASH_API_KEY||'').trim()?'configured_api':'public_discovery_only')
          : row.market,
      lease_credentials_present:
        row.market==='akash'
          ? Boolean(String(env.AKASH_API_KEY||'').trim())
          : null,
      broker_deployment_id:
        row.market==='evercraft-broker'?brokerDeploymentId||null:null,
    })),
  ];
  if(
    (requested.has('evercraft-broker')||requested.has('evercraft_broker')) &&
    !wantBroker
  ){
    diagnostics.push({
      market:'evercraft-broker',
      state:'unavailable',
      reason:'yard_or_broker_deployment_not_found',
    });
  }
  if(
    (requested.has('evercraft-voluntary')||requested.has('evercraft_voluntary')) &&
    !wantVoluntary
  ){
    diagnostics.push({
      market:'evercraft-voluntary',
      state:'unavailable',
      reason:'voluntary_exchange_endpoint_not_configured',
    });
  }

  return {
    schema:'evercraft.saban.compute-market-factory.v2',
    adapters,
    markets:adapters.map((adapter)=>String(adapter.market||'unknown')),
    inventory:stack.inventory,
    doctrine:stack.doctrine,
    diagnostics,
    automatic,
    yard_state_dir:yardStateDir,
    broker_deployment_id:brokerDeploymentId||null,
    voluntary_endpoint_configured:Boolean(voluntaryEndpoint),
    paid_capacity_auto_authorized:false,
  };
}
