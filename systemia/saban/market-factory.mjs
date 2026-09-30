import fs from 'node:fs';
import path from 'node:path';
import { YardOperator } from '../yard/operator.mjs';
import { createEvercraftBrokerMarketAdapter } from './markets/evercraft-broker.mjs';
import { createAkashMarketAdapter } from './markets/akash.mjs';

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

export function buildComputeMarketAdapters({
  acquisition={},
  env=process.env,
  cwd=process.cwd(),
}={}){
  const adapters=[...explicitAdapters(acquisition)];
  const diagnostics=[];
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

  const wantBroker=
    requested.has('evercraft-broker') ||
    requested.has('evercraft_broker') ||
    (automatic&&Boolean(yardStateDir&&brokerDeploymentId));

  if(wantBroker){
    if(yardStateDir&&brokerDeploymentId){
      try{
        adapters.push(createEvercraftBrokerMarketAdapter({
          yard:new YardOperator({stateDir:yardStateDir}),
          brokerDeploymentId,
        }));
        diagnostics.push({
          market:'evercraft-broker',
          state:'ready',
          source:'yard',
          broker_deployment_id:brokerDeploymentId,
        });
      }catch(error){
        diagnostics.push({
          market:'evercraft-broker',
          state:'unavailable',
          reason:String(error?.message||error),
        });
      }
    }else{
      diagnostics.push({
        market:'evercraft-broker',
        state:'unavailable',
        reason:'yard_or_broker_deployment_not_found',
      });
    }
  }

  const publicMarketDiscovery =
    acquisition.public_market_discovery===true ||
    truthy(env.SABAN_PUBLIC_MARKET_DISCOVERY);
  const wantAkash=
    requested.has('akash') ||
    (
      automatic &&
      (
        Boolean(String(env.AKASH_API_KEY||'').trim()) ||
        publicMarketDiscovery
      )
    );

  if(wantAkash){
    adapters.push(createAkashMarketAdapter({
      apiKey:String(env.AKASH_API_KEY||''),
      baseUrl:acquisition.akash_base_url||env.AKASH_BASE_URL||'https://console-api.akash.network',
      quoteTimeoutMs:Number(acquisition.akash_quote_timeout_ms||45000),
    }));
    diagnostics.push({
      market:'akash',
      state:'ready',
      source:String(env.AKASH_API_KEY||'').trim()?'configured_api':'public_discovery_only',
      lease_credentials_present:Boolean(String(env.AKASH_API_KEY||'').trim()),
    });
  }

  const deduped=[];
  const seen=new Set();
  for(const adapter of adapters){
    const market=String(adapter?.market||'unknown').toLowerCase();
    if(seen.has(market)) continue;
    seen.add(market);
    deduped.push(adapter);
  }

  return {
    schema:'evercraft.saban.compute-market-factory.v1',
    adapters:deduped,
    markets:deduped.map((adapter)=>String(adapter.market||'unknown')),
    diagnostics,
    automatic,
    yard_state_dir:yardStateDir,
    broker_deployment_id:brokerDeploymentId||null,
    paid_capacity_auto_authorized:false,
  };
}
