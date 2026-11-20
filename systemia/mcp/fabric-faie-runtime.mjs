import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFaieRuntime } from '../faie/runtime.mjs';
import { faieCollectorConfigFromEnv } from '../faie/collectors.mjs';
import { collectUsdaSoilAtPoint } from '../faie/soil-source.mjs';
import { buildFaieSiteScan } from '../faie/site-scan.mjs';
import { collectYakimaHistoricalClimate, eligibleYakimaClimatePoint } from '../faie/ncei-climate-history.mjs';
import {
  executeFaieMcpRpc,
  faieMcpTools,
  publicFaieInvestigation
} from '../faie/mcp.mjs';

function clean(value,max=4000){
  return String(value??'').trim().slice(0,max);
}

function sendJson(res,status,body,headers={}){
  const data=Buffer.from(JSON.stringify(body));
  res.writeHead(status,{
    'content-type':'application/json; charset=utf-8',
    'content-length':data.length,
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
    ...headers,
  });
  res.end(data);
}

function sendHtml(res,status,body,{headOnly=false}={}){
  const data=Buffer.from(String(body));
  res.writeHead(status,{
    'content-type':'text/html; charset=utf-8',
    'content-length':data.length,
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
    'x-frame-options':'DENY',
    'referrer-policy':'strict-origin-when-cross-origin',
    'permissions-policy':'camera=(), microphone=(), geolocation=()',
    'content-security-policy':[
      "default-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline'",
      "connect-src 'self'",
      "img-src 'self' data:",
      "base-uri 'none'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'"
    ].join('; '),
  });
  if(headOnly) return res.end();
  res.end(data);
}

async function readJson(req,{maxBytes=256*1024}={}){
  const chunks=[];
  let bytes=0;
  for await (const chunk of req){
    bytes+=chunk.length;
    if(bytes>maxBytes) throw new Error('request_body_too_large');
    chunks.push(chunk);
  }
  const raw=Buffer.concat(chunks).toString('utf8');
  return raw?JSON.parse(raw):{};
}

function clientKey(req){
  const forwarded=clean(req.headers?.['x-forwarded-for'],300).split(',')[0].trim();
  return forwarded||clean(req.socket?.remoteAddress,120)||'unknown';
}

function createFixedWindowLimiter({limit=45,windowMs=60_000}={}){
  const buckets=new Map();
  return (req)=>{
    const now=Date.now();
    const key=clientKey(req);
    const current=buckets.get(key);
    if(!current||current.reset_at<=now){
      buckets.set(key,{count:1,reset_at:now+windowMs});
      return {ok:true,retry_after:0};
    }
    current.count+=1;
    if(current.count>limit){
      return {ok:false,retry_after:Math.max(1,Math.ceil((current.reset_at-now)/1000))};
    }
    return {ok:true,retry_after:0};
  };
}

function normalizedInvestigationInput(body={}){
  const question=clean(body.question||body.query,1200);
  if(!question) throw new Error('question is required.');
  const regionKeys=body.region_keys||body.regions||body.region||[];
  const assetTypes=body.asset_types||body.assets||[];
  return {
    question,
    region_keys:Array.isArray(regionKeys)?regionKeys:[regionKeys].filter(Boolean),
    asset_types:Array.isArray(assetTypes)?assetTypes:[assetTypes].filter(Boolean),
    crop:body.crop,
    water_source:body.water_source,
    thesis_assumptions:body.thesis_assumptions||body.assumptions,
    horizon_days:body.horizon_days,
    include_weak_evidence:body.include_weak_evidence
  };
}

export function createFabricFaieSurface({
  runtime=null,
  stateDir=process.env.FAIE_EDGE_STATE_DIR || path.join(os.tmpdir(),'evercraft-fabric-faIE'),
  intervalMs=Number(process.env.FAIE_INTERVAL_MS || 5*60*1000),
  fetchImpl=globalThis.fetch,
  collectorConfig=null,
  startResident=true,
  postLimit=45
}={}){
  const moduleDir=path.dirname(fileURLToPath(import.meta.url));
  const pagePath=path.resolve(moduleDir,'../../public/faie/index.html');
  const ownsRuntime=!runtime;
  const effectiveCollectorConfig=collectorConfig||faieCollectorConfigFromEnv({
    ...process.env,
    FAIE_REGION_PROFILE:process.env.FAIE_REGION_PROFILE||'yakima-basin-wa'
  });
  const faieRuntime=runtime||createFaieRuntime({
    stateDir,
    intervalMs,
    fetchImpl,
    collectorConfig:effectiveCollectorConfig
  });

  if(ownsRuntime&&startResident) faieRuntime.start();

  const limit=createFixedWindowLimiter({limit:postLimit});
  // Explicitly low-volume pilot: USDA Soil Data Access is a government service,
  // not an unlimited anonymous upstream proxy. This preview is ephemeral.
  const soilClientLimit=createFixedWindowLimiter({limit:4,windowMs:60_000});
  const soilGlobalLimit=createFixedWindowLimiter({limit:12,windowMs:60_000});
  let soilPreviewInFlight=0;
  const climateClientLimit=createFixedWindowLimiter({limit:2,windowMs:60_000});
  const climateGlobalLimit=createFixedWindowLimiter({limit:8,windowMs:60_000});
  let climateInFlight=0;

  function health(){
    const runtimeHealth=faieRuntime.health();
    return {
      ...runtimeHealth,
      public_surface:'/faie/',
      design_partner_surface:'/faie/agnormal/',
      public_api:'/api/faie',
      public_mcp:'/mcp/faie',
      fabric_native:true,
      transport_owner:'Evercraft Fabric',
      base44_transport_enabled:false,
      public_preview_persists_queries:false,
      deployment_region_profile:runtimeHealth.official_collectors?.region_profile_id||null,
      edge_state_persistence:process.env.FAIE_EDGE_STATE_DIR?'configured_persistent_or_operator_managed':'private_tmp_rebuildable'
    };
  }

  async function handle(req,res){
    const parsed=new URL(String(req.url||'/'),'http://fabric.local');
    const pathname=parsed.pathname;
    const isFaie=
      pathname==='/faie' ||
      pathname==='/faie/' ||
      pathname==='/faie/agnormal' ||
      pathname==='/faie/agnormal/' ||
      pathname.startsWith('/api/faie/') ||
      pathname==='/mcp/faie';
    if(!isFaie) return false;

    if((req.method==='GET'||req.method==='HEAD')&&(
      pathname==='/faie' ||
      pathname==='/faie/' ||
      pathname==='/faie/agnormal' ||
      pathname==='/faie/agnormal/'
    )){
      if(!fs.existsSync(pagePath)){
        sendJson(res,503,{ok:false,error:'faie_public_surface_unavailable'});
        return true;
      }
      sendHtml(res,200,fs.readFileSync(pagePath,'utf8'),{headOnly:req.method==='HEAD'});
      return true;
    }

    if(req.method==='GET'&&pathname==='/api/faie/health'){
      sendJson(res,200,health());
      return true;
    }

    if(req.method==='GET'&&pathname==='/api/faie/signals'){
      const requested=Number(parsed.searchParams.get('limit')||50);
      const snapshot=faieRuntime.snapshot(Math.max(1,Math.min(200,Number.isFinite(requested)?requested:50)));
      sendJson(res,200,snapshot,{'cache-control':'public, max-age=30, must-revalidate'});
      return true;
    }

    if(pathname==='/mcp/faie'){
      if(req.method==='GET'){
        if(parsed.searchParams.get('action')!=='health'){
          sendJson(res,405,{ok:false,error:'Use MCP Streamable HTTP POST or ?action=health.'});
          return true;
        }
        sendJson(res,200,{
          ok:true,
          service:'FAIE',
          server:'evercraft-faie',
          version:'1.1.0',
          runtime:'Evercraft Fabric / Systemia',
          transport:'Streamable HTTP',
          tools:faieMcpTools().map((tool)=>tool.name),
          public_surface:'/faie/',
          persisted_public_investigations:false,
          checkout_enabled:false,
          payment_enabled:false,
          decision_authority:false,
          publication_authority:false,
          base44_transport_enabled:false
        },{'access-control-allow-origin':'*'});
        return true;
      }

      if(req.method!=='POST'){
        sendJson(res,405,{ok:false,error:'method_not_allowed'});
        return true;
      }

      const allowance=limit(req);
      if(!allowance.ok){
        sendJson(res,429,{ok:false,error:'rate_limited'},{'retry-after':String(allowance.retry_after)});
        return true;
      }

      const body=await readJson(req);
      const response=await executeFaieMcpRpc(faieRuntime,body);
      if(response===null){
        res.writeHead(202,{
          'cache-control':'no-store',
          'access-control-allow-origin':'*'
        });
        res.end();
        return true;
      }
      sendJson(res,200,response,{'access-control-allow-origin':'*'});
      return true;
    }

    if(req.method==='POST'&&pathname==='/api/faie/climate/history'){
      const globalAllowance=climateGlobalLimit({headers:{},socket:{remoteAddress:'all-climate-visitors'}});
      const clientAllowance=climateClientLimit(req);
      if(!globalAllowance.ok||!clientAllowance.ok){
        sendJson(res,429,{ok:false,error:'climate_history_rate_limited'},{
          'retry-after':String(Math.max(globalAllowance.retry_after,clientAllowance.retry_after))
        });
        return true;
      }
      if(climateInFlight>=1){
        sendJson(res,503,{ok:false,error:'climate_history_busy_try_later'});
        return true;
      }
      let body;
      try{body=await readJson(req,{maxBytes:1024});}
      catch{
        sendJson(res,400,{ok:false,error:'invalid_climate_history_input'});
        return true;
      }
      const latRaw=String(body?.latitude??'').trim();
      const lonRaw=String(body?.longitude??'').trim();
      const latitude=Number(latRaw),longitude=Number(lonRaw);
      if(!latRaw||!lonRaw||!Number.isFinite(latitude)||!Number.isFinite(longitude)||
         latitude<24||latitude>50||longitude< -125||longitude> -66){
        sendJson(res,400,{ok:false,error:'Enter an explicit valid coordinate point in the contiguous United States.'});
        return true;
      }
      if(!eligibleYakimaClimatePoint(latitude,longitude).station_eligible){
        sendJson(res,422,{
          ok:false,error:'No approved historical station within 40 km of this point. No site climate is inferred.',
          request_persisted:false
        });
        return true;
      }
      climateInFlight++;
      try{
        const result=await collectYakimaHistoricalClimate({
          latitude,longitude,fetchImpl,retrievedAt:new Date().toISOString()
        });
        if(result.status!=='historical_station_context_available'){
          sendJson(res,503,{
            ok:false,error:'Official daily records did not provide adequate observation coverage.',
            station:result.station,metrics:result.metrics,request_persisted:false
          });
        }else sendJson(res,200,result);
      }catch{
        sendJson(res,502,{ok:false,error:'Official historical station records could not be verified. No climate result is inferred.',request_persisted:false});
      }finally{climateInFlight--}
      return true;
    }

    if(req.method==='POST'&&pathname==='/api/faie/site/scan'){
      // Same shared limiter protects USDA from public soil-only and combined
      // scans, preventing route-hopping around the low-volume upstream budget.
      const globalAllowance=soilGlobalLimit({headers:{},socket:{remoteAddress:'all-public-soil-visitors'}});
      const clientAllowance=soilClientLimit(req);
      if(!globalAllowance.ok||!clientAllowance.ok){
        sendJson(res,429,{ok:false,error:'site_scan_rate_limited'},{
          'retry-after':String(Math.max(globalAllowance.retry_after,clientAllowance.retry_after))
        });
        return true;
      }
      if(soilPreviewInFlight>=2){
        sendJson(res,503,{ok:false,error:'site_scan_busy_try_later'});
        return true;
      }
      let body;
      try{body=await readJson(req,{maxBytes:2048});}
      catch{
        sendJson(res,400,{ok:false,error:'invalid_site_scan_input'});
        return true;
      }
      const latRaw=String(body?.latitude??'').trim();
      const lonRaw=String(body?.longitude??'').trim();
      const latitude=Number(latRaw),longitude=Number(lonRaw);
      if(!latRaw||!lonRaw||!Number.isFinite(latitude)||!Number.isFinite(longitude)||
         latitude<24||latitude>50||longitude< -125||longitude> -66){
        sendJson(res,400,{ok:false,error:'Enter valid latitude and longitude inside the contiguous United States.'});
        return true;
      }
      soilPreviewInFlight+=1;
      try{
        const scan=await buildFaieSiteScan({
          latitude,longitude,fetchImpl,retrievedAt:new Date().toISOString()
        });
        if(scan.state==='insufficient_evidence'){
          sendJson(res,502,{
            ok:false,error:'Neither official point source returned usable evidence. No site report was inferred.',
            source_receipts:scan.source_receipts,
            request_persisted:false
          });
        }else{
          sendJson(res,200,scan);
        }
      }catch{
        sendJson(res,502,{ok:false,error:'Site scan did not complete with verifiable source data.'});
      }finally{
        soilPreviewInFlight-=1;
      }
      return true;
    }

    if(req.method==='POST'&&pathname==='/api/faie/soil/preview'){
      const globalAllowance=soilGlobalLimit({headers:{},socket:{remoteAddress:'all-public-soil-visitors'}});
      const clientAllowance=soilClientLimit(req);
      if(!globalAllowance.ok||!clientAllowance.ok){
        sendJson(res,429,{ok:false,error:'soil_preview_rate_limited'},{
          'retry-after':String(Math.max(globalAllowance.retry_after,clientAllowance.retry_after))
        });
        return true;
      }
      if(soilPreviewInFlight>=2){
        sendJson(res,503,{ok:false,error:'soil_preview_busy_try_later'});
        return true;
      }
      let body;
      try{
        body=await readJson(req,{maxBytes:2048});
      }catch(error){
        sendJson(res,400,{ok:false,error:'invalid_soil_preview_input'});
        return true;
      }
      const latRaw=String(body?.latitude??'').trim();
      const lonRaw=String(body?.longitude??'').trim();
      const latitude=Number(latRaw),longitude=Number(lonRaw);
      if(!latRaw||!lonRaw||!Number.isFinite(latitude)||!Number.isFinite(longitude)||
        latitude<24||latitude>50||longitude< -125||longitude> -66){
        sendJson(res,400,{ok:false,error:'Enter valid latitude and longitude inside the contiguous United States.'});
        return true;
      }
      soilPreviewInFlight+=1;
      try{
        const source=await collectUsdaSoilAtPoint({
          latitude,longitude,regionKeys:[],fetchImpl,retrievedAt:new Date().toISOString()
        });
        // The result is returned directly to the visitor only. Never ingest
        // coordinates, mapunits or visitor queries into shared FAIE memory.
        const observed=source.observation;
        const mapunits=(observed?.facts?.mapunits||[]).slice(0,6).map((row)=>({
          name:row.muname,
          survey_area_name:row.survey_area_name,
          farmland_classification:row.farmland_classification,
          survey_updated_at:row.source_updated_at,
          source_version:row.source_version,
          components:(row.components||[]).slice(0,3).map((component)=>({
            name:component.name,
            percentage:component.percent,
            slope_percent:component.slope_percent,
            major_component:component.major_component
          }))
        }));
        sendJson(res,200,{
          schema:'evercraft.faie.public-soil-preview.v1',
          status:mapunits.length?'mapped_soil_available':'no_mapped_soil_found',
          source:'USDA NRCS Soil Data Access / SSURGO',
          evidence_state:'REPORTED',
          retrieved_at:source.retrieved_at,
          source_updated_at:observed?.facts?.source_updated_at||null,
          coordinates:{latitude,longitude},
          mapunit_count:source.mapunit_count,
          mapunits,
          provenance_urls:[
            'https://sdmdataaccess.nrcs.usda.gov/WebServiceHelp.aspx',
            'https://sdmdataaccess.nrcs.usda.gov/documents/AdvancedQueries.html'
          ],
          field_verification_required:true,
          soil_testing_performed:false,
          site_suitability_verdict:null,
          decision_authority:false,
          publication_authority:false,
          request_persisted:false,
          warning:'USDA mapped soil-survey context is not a field soil test, a guarantee of current conditions, an irrigation right, or a site approval.'
        });
      }catch(error){
        sendJson(res,502,{ok:false,error:'Official USDA soil information could not be verified. No map unit is being inferred.'});
      }finally{
        soilPreviewInFlight-=1;
      }
      return true;
    }

    if(req.method==='POST'&&(pathname==='/api/faie/investigate'||pathname==='/api/faie/compare')){
      const allowance=limit(req);
      if(!allowance.ok){
        sendJson(res,429,{ok:false,error:'rate_limited'},{'retry-after':String(allowance.retry_after)});
        return true;
      }

      let body;
      try{
        body=await readJson(req,{maxBytes:128*1024});
      }catch(error){
        sendJson(res,400,{ok:false,error:error instanceof Error?error.message:String(error)});
        return true;
      }

      try{
        if(pathname==='/api/faie/investigate'){
          const investigation=faieRuntime.preview(normalizedInvestigationInput(body));
          sendJson(res,200,publicFaieInvestigation(investigation));
          return true;
        }

        const question=clean(body.question||body.query,1200);
        if(!question) throw new Error('question is required.');
        const candidates=Array.isArray(body.candidates)?body.candidates:[];
        if(candidates.length<2||candidates.length>8){
          throw new Error('candidates must contain between 2 and 8 items.');
        }
        const comparison=faieRuntime.previewComparison({
          question,
          candidates,
          asset_types:body.asset_types||body.assets,
          crop:body.crop,
          water_source:body.water_source,
          thesis_assumptions:body.thesis_assumptions||body.assumptions,
          horizon_days:body.horizon_days,
          include_weak_evidence:body.include_weak_evidence
        });
        sendJson(res,200,comparison);
        return true;
      }catch(error){
        sendJson(res,400,{ok:false,error:error instanceof Error?error.message:String(error)});
        return true;
      }
    }

    sendJson(res,404,{ok:false,error:'faie_route_not_found'});
    return true;
  }

  async function close(){
    if(ownsRuntime){
      faieRuntime.stop();
    }
  }

  return {
    schema:'evercraft.fabric-faie-surface.v1',
    handle,
    health,
    close,
    runtime:faieRuntime
  };
}
