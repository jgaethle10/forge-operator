import type { Express, Request, Response } from 'express';
import { clipCapabilities, planClipJob, planDistributionCampaign } from './planner.mjs';

function requestOrigin(req:Request){
  const configured=String(process.env.CHUM_PUBLIC_ORIGIN || process.env.PUBLIC_BASE_URL || '').trim();
  if(configured){
    try{ return new URL(configured).origin; }catch{}
  }
  const host=String(req.get('host') || '').trim();
  if(!host) return '';
  const forwarded=String(req.get('x-forwarded-proto') || '').split(',')[0].trim();
  const protocol=forwarded==='http'||forwarded==='https' ? forwarded : req.protocol;
  try{ return new URL(`${protocol}://${host}`).origin; }catch{ return ''; }
}
function rpcResult(id:unknown,result:unknown){ return {jsonrpc:'2.0',id:id??null,result}; }
function rpcError(id:unknown,code:number,message:string){ return {jsonrpc:'2.0',id:id??null,error:{code,message}}; }

export async function executeClipMcpRpc(rpc:any,{origin=''}={}){
  const method=String(rpc?.method || '');
  const id=rpc?.id ?? null;
  if(method==='initialize'){
    return rpcResult(id,{
      protocolVersion:'2025-03-26',
      capabilities:{tools:{}},
      serverInfo:{name:'evercraft-clip',version:'3.0.0-yard'},
      instructions:'Read-only Evercraft Clip discovery and planning on Yard/Evercraft Compute. No upload, payment or publication authority.'
    });
  }
  if(method==='tools/list'){
    return rpcResult(id,{tools:[
      {
        name:'get_clip_capabilities',
        title:'Get Evercraft Clip capabilities',
        description:'Read the owned Clip planning boundary, migration state and provider-execution holds.',
        inputSchema:{type:'object',properties:{},additionalProperties:false},
        annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}
      },
      {
        name:'plan_clip_job',
        title:'Plan an Evercraft Clip social-video job',
        description:'Create a non-executing Clip plan. Checks bounded source limits, creative treatment, target platforms and ForensiScope overflow. Does not upload, charge or publish.',
        inputSchema:{
          type:'object',
          properties:{
            source_file_size_bytes:{type:'number',minimum:0},
            source_duration_seconds:{type:'number',minimum:0},
            target_platforms:{type:'array',maxItems:10,items:{type:'string',maxLength:40}},
            creative_style:{type:'string',enum:['clean','bold','documentary','property']},
            caption_mode:{type:'string',enum:['burned_in','hook_only','none']},
            needs_full_timeline:{type:'boolean'},
            complex_media:{type:'boolean'},
            needs_deduplication:{type:'boolean'},
            goal:{type:'string',maxLength:500}
          },
          additionalProperties:false
        },
        annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}
      },
      {
        name:'plan_distribution_campaign',
        title:'Plan an Evercraft Clip cross-platform campaign',
        description:'Plan campaign objective, audience, CTA and platform derivatives without uploading, charging or publishing.',
        inputSchema:{
          type:'object',
          properties:{
            campaign_key:{type:'string',maxLength:300},
            source_package_key:{type:'string',maxLength:320},
            title:{type:'string',maxLength:500},
            objective:{type:'string',enum:['awareness','education','revenue','lead_generation','recruiting','product_discovery','retention','other']},
            audience_intent:{type:'string',maxLength:3000},
            canonical_url:{type:'string',maxLength:1800},
            cta_label:{type:'string',maxLength:240},
            cta_url:{type:'string',maxLength:1800},
            commerce_offer_id:{type:'string',maxLength:320},
            conversion_event:{type:'string',maxLength:240},
            target_platforms:{type:'array',maxItems:10,items:{type:'string',maxLength:40}},
            creative_style:{type:'string',enum:['clean','bold','documentary','property']},
            caption_mode:{type:'string',enum:['burned_in','hook_only','none']}
          },
          additionalProperties:false
        },
        annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}
      }
    ]});
  }
  if(method==='tools/call'){
    const name=String(rpc?.params?.name || '');
    const args=rpc?.params?.arguments || {};
    let payload;
    if(name==='get_clip_capabilities') payload=clipCapabilities({origin});
    else if(name==='plan_clip_job') payload=planClipJob(args);
    else if(name==='plan_distribution_campaign') payload=planDistributionCampaign(args);
    else return rpcError(id,-32602,'Unknown or unsupported Clip tool.');
    return rpcResult(id,{
      content:[{type:'text',text:JSON.stringify(payload,null,2)}],
      structuredContent:payload,
      isError:false
    });
  }
  if(method==='notifications/initialized') return null;
  return rpcError(id,-32601,'Method not found.');
}

function openapi(origin:string){
  const server=origin ? origin : '';
  return {
    openapi:'3.1.0',
    info:{
      title:'Evercraft Clip Yard Gateway',
      version:'3.0.0',
      description:'Read-only owned Clip discovery and campaign/job planning. Media upload, payment and publication remain separately gated.'
    },
    servers:[{url:server || '/'}],
    paths:{
      '/api/clip':{
        get:{operationId:'getEvercraftClipDiscovery',responses:{'200':{description:'Clip discovery'}}},
        post:{operationId:'planEvercraftClip',responses:{'200':{description:'Non-executing Clip plan'}}}
      },
      '/mcp/evercraft-clip':{
        post:{operationId:'evercraftClipMcp',responses:{'200':{description:'MCP Streamable HTTP JSON-RPC response'}}}
      }
    }
  };
}

function llms(origin:string){
  const base=origin.replace(/\/$/,'');
  return [
    '# Evercraft Clip',
    '',
    'Owned runtime: Yard / Evercraft Compute.',
    `Gateway: ${base}/api/clip`,
    `MCP: ${base}/mcp/evercraft-clip`,
    '',
    'This public edge is read-only discovery and planning. It cannot upload media, create checkout, charge, publish, or grant provider authority.',
    'Use plan_clip_job for bounded social-video planning. Use plan_distribution_campaign for campaign and platform derivative planning.',
    'For oversized, long, full-timeline, complex, or deduplication-heavy media, prepare a ForensiScope specialist handoff rather than transferring private media automatically.',
    'Facebook, LinkedIn and Instagram legacy execution lanes exist but are not considered migrated until owned provider adapters pass live provider canary and readback.',
    'YouTube remains authorization/canary gated. TikTok remains unverified.'
  ].join('\n');
}

export function registerClipGateway(app:Express){
  app.get('/api/clip',(req:Request,res:Response)=>{
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Cache-Control','public, max-age=60, must-revalidate');
    const origin=requestOrigin(req);
    const view=String(req.query.view || 'capabilities').toLowerCase();
    if(view==='openapi'){ res.json(openapi(origin)); return; }
    if(view==='llms'){ res.type('text/plain').send(llms(origin)); return; }
    res.json(clipCapabilities({origin}));
  });

  app.post('/api/clip',(req:Request,res:Response)=>{
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Cache-Control','no-store');
    const origin=requestOrigin(req);
    const action=String(req.body?.action || 'capabilities').trim().toLowerCase();
    if(action==='capabilities'){ res.json({ok:true,result:clipCapabilities({origin})}); return; }
    if(action==='plan_job'){ res.json({ok:true,result:planClipJob(req.body || {})}); return; }
    if(action==='plan_distribution_campaign'){ res.json({ok:true,result:planDistributionCampaign(req.body || {})}); return; }
    res.status(400).json({ok:false,error:'unsupported_action',supported_actions:['capabilities','plan_job','plan_distribution_campaign']});
  });

  app.get('/mcp/evercraft-clip',(req:Request,res:Response)=>{
    if(String(req.query.action || '')!=='health'){
      res.status(405).json({ok:false,error:'Use MCP Streamable HTTP POST or ?action=health.'});
      return;
    }
    res.setHeader('Cache-Control','no-store');
    res.json({
      ok:true,
      service:'Evercraft Clip',
      server:'evercraft-clip',
      version:'3.0.0-yard',
      runtime:'yard_evercraft_compute',
      transport:'Streamable HTTP',
      tools:['get_clip_capabilities','plan_clip_job','plan_distribution_campaign'],
      read_only:true,
      upload_authority:false,
      payment_authority:false,
      publication_authority:false
    });
  });

  app.post('/mcp/evercraft-clip',async(req:Request,res:Response)=>{
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Cache-Control','no-store');
    const response=await executeClipMcpRpc(req.body,{origin:requestOrigin(req)});
    if(response===null){ res.status(202).end(); return; }
    res.type('application/json').json(response);
  });
}
