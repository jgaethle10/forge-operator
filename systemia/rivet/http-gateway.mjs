import path from 'node:path';
import { generateYardReport } from './report-runtime.mjs';

function clean(value){ return String(value ?? '').trim(); }

export function registerRivetReportGateway(app,{
  gatewayToken=process.env.RIVET_REPORT_GATEWAY_TOKEN || '',
  systemiaMachineKey=process.env.SYSTEMIA_MACHINE_KEY || '',
  sourceUrl=process.env.ALIEV_YARD_SOURCE_URL || 'https://base44.app/api/apps/69b9b64d86a732029ce0db81/functions/energySiteLookup',
  stateDir=process.env.RIVET_REPORT_STATE_DIR || path.join('/tmp','evercraft-rivet-report'),
  generate=generateYardReport
}={}){
  app.get('/api/rivet/report-health',(_req,res)=>{
    res.setHeader('cache-control','no-store');
    res.json({
      ok:true,
      service:'rivet-yard-report-gateway',
      runtime:'Forge/Yard',
      configured:Boolean(clean(gatewayToken) && clean(systemiaMachineKey)),
      source_contract:'rivet_report_snapshot_v1'
    });
  });

  app.post('/api/rivet/reports',async(req,res)=>{
    if(!clean(gatewayToken) || !clean(systemiaMachineKey)){
      res.status(503).json({ok:false,error:'rivet_report_gateway_not_configured'});
      return;
    }

    const authorization=clean(req.headers.authorization);
    if(authorization !== 'Bearer '+gatewayToken){
      res.status(401).json({ok:false,error:'rivet_report_gateway_authorization_required'});
      return;
    }

    const address=clean(req.body?.address);
    if(address.length<5){
      res.status(400).json({ok:false,error:'address_required'});
      return;
    }

    try{
      const progress=[];
      const record=await generate({
        address,
        sourceUrl,
        systemiaMachineKey,
        stateDir,
        onProgress:event=>progress.push(event)
      });
      res.status(201).json({
        ok:true,
        progress:progress.at(-1) || null,
        ...record
      });
    }catch(error){
      res.status(502).json({
        ok:false,
        error:'rivet_report_generation_failed',
        detail:error instanceof Error ? error.message : String(error)
      });
    }
  });
}
