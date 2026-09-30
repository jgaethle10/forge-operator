import path from 'node:path';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { generateYardReport } from './report-runtime.mjs';

function clean(value){ return String(value ?? '').trim(); }
function safeId(value){ return clean(value).replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,180); }
function sha256(bytes){ return createHash('sha256').update(bytes).digest('hex'); }
function authorized(req,token){ return clean(req.headers.authorization) === 'Bearer '+token; }

export function registerRivetReportGateway(app,{
  gatewayToken=process.env.RIVET_REPORT_GATEWAY_TOKEN || '',
  systemiaMachineKey=process.env.SYSTEMIA_MACHINE_KEY || '',
  sourceUrl=process.env.ALIEV_YARD_SOURCE_URL || '',
  stateDir=process.env.RIVET_REPORT_STATE_DIR || path.join('/tmp','evercraft-rivet-report'),
  generate=generateYardReport,
  sourceRequired=generate===generateYardReport
}={}){
  const sourceReady=()=>!sourceRequired || Boolean(clean(sourceUrl));
  const configured=()=>Boolean(clean(gatewayToken) && clean(systemiaMachineKey) && sourceReady());
  app.get('/api/rivet/report-health',(_req,res)=>{
    res.setHeader('cache-control','no-store');
    res.json({
      ok:true,
      service:'rivet-yard-report-gateway',
      runtime:'Forge/Yard',
      configured:Boolean(clean(gatewayToken) && clean(systemiaMachineKey) && clean(sourceUrl)),
      owned_source_configured:Boolean(clean(sourceUrl) && !/(^|\\.)base44\\.app$/i.test((()=>{try{return new URL(sourceUrl).hostname}catch{return ''}})())),
      base44_source_refused:true,
      source_contract:'rivet_report_snapshot_v1',
      canonical_store:'yard-atomic-files-v2',
      full_source_snapshot_persistence:true,
      source_coverage_manifest_required:true
    });
  });

  app.post('/api/rivet/reports',async(req,res)=>{
    if(!configured()){
      res.status(503).json({ok:false,error:'rivet_report_gateway_not_configured'});
      return;
    }

    if(!authorized(req,gatewayToken)){
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
        reportType:req.body?.report_type,
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

  app.get('/api/rivet/reports/:reportId',async(req,res)=>{
    if(!clean(gatewayToken) || !clean(systemiaMachineKey)){
      res.status(503).json({ok:false,error:'rivet_report_gateway_not_configured'});
      return;
    }
    if(!authorized(req,gatewayToken)){
      res.status(401).json({ok:false,error:'rivet_report_gateway_authorization_required'});
      return;
    }
    const reportId=clean(req.params.reportId);
    const file=path.join(stateDir,'reports',safeId(reportId)+'.json');
    if(!fs.existsSync(file)){
      res.status(404).json({ok:false,error:'report_not_found'});
      return;
    }
    const record=JSON.parse(fs.readFileSync(file,'utf8'));
    res.setHeader('cache-control','no-store');
    res.json({ok:true,...record});
  });

  app.get('/api/rivet/reports/:reportId/source',async(req,res)=>{
    if(!clean(gatewayToken) || !clean(systemiaMachineKey)){
      res.status(503).json({ok:false,error:'rivet_report_gateway_not_configured'});
      return;
    }
    if(!authorized(req,gatewayToken)){
      res.status(401).json({ok:false,error:'rivet_report_gateway_authorization_required'});
      return;
    }
    const reportId=clean(req.params.reportId);
    const reportFile=path.join(stateDir,'reports',safeId(reportId)+'.json');
    if(!fs.existsSync(reportFile)){
      res.status(404).json({ok:false,error:'report_not_found'});
      return;
    }
    const record=JSON.parse(fs.readFileSync(reportFile,'utf8'));
    const ref=clean(record?.source_snapshot?.store_ref);
    const root=path.resolve(stateDir);
    const file=path.resolve(stateDir,ref);
    if(!ref || !file.startsWith(root+path.sep) || !fs.existsSync(file)){
      res.status(404).json({ok:false,error:'source_snapshot_not_found'});
      return;
    }
    const bytes=fs.readFileSync(file);
    const expectedSha=clean(record?.source_snapshot?.sha256);
    const expectedBytes=Number(record?.source_snapshot?.byte_count||0);
    if(sha256(bytes)!==expectedSha || bytes.byteLength!==expectedBytes){
      res.status(409).json({ok:false,error:'source_snapshot_integrity_failed'});
      return;
    }
    res.setHeader('cache-control','no-store');
    res.json({
      ok:true,
      report_id:reportId,
      sha256:expectedSha,
      byte_count:bytes.byteLength,
      source_snapshot:JSON.parse(bytes.toString('utf8'))
    });
  });
}
