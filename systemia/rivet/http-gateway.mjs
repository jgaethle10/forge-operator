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
  sourceRequired=generate===generateYardReport,
  relay=null
}={}){
  const sourceReady=()=>!sourceRequired || Boolean(clean(sourceUrl));
  const configured=()=>Boolean(clean(gatewayToken) && clean(systemiaMachineKey) && sourceReady());
  app.get('/api/rivet/report-health',(_req,res)=>{
    res.setHeader('cache-control','no-store');
    res.json({
      ok:true,
      service:'rivet-yard-report-gateway',
      runtime:'Forge/Yard',
      configured:configured(),
      source_required:Boolean(sourceRequired),
      notification_fabric_connected:Boolean(relay && typeof relay.enqueueIntent==='function'),
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
    const notificationPrincipalId=clean(req.body?.notification_principal_id);
    if(notificationPrincipalId.length>256 || /[\u0000-\u001f\u007f]/.test(notificationPrincipalId)){
      res.status(400).json({ok:false,error:'notification_principal_id_invalid'});
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
      let notification={state:notificationPrincipalId?'relay_unavailable':'not_requested'};
      if(notificationPrincipalId && relay && typeof relay.enqueueIntent==='function'){
        const notificationKey=sha256(Buffer.from(String(record.report_id)+'|'+notificationPrincipalId)).slice(0,24);
        const notificationId='rivet-report-ready:'+notificationKey;
        try{
          const queued=relay.enqueueIntent({
            id:notificationId,
            product:'rivet',
            purpose:'transactional',
            priority:'normal',
            title:'RIVET report ready',
            body:'Your site opportunity report is ready.',
            recipient_ids:[notificationPrincipalId],
            dedupe_key:'report-ready:'+String(record.report_id),
            dedupe_window_seconds:86400,
            data:{
              action:'open_rivet_report',
              report_id:String(record.report_id),
              generation_state:'ready'
            }
          },{
            idempotencyKey:'rivet:report-ready:'+notificationKey
          });
          notification={
            state:queued?.job?.duplicate?'already_queued':'queued',
            job_id:queued?.job?.id || null,
            notification_id:notificationId
          };
        }catch{
          notification={state:'enqueue_failed'};
        }
      }
      res.status(201).json({
        ok:true,
        progress:progress.at(-1) || null,
        notification,
        ...record
      });
    }catch(error){
      let operator_signal={state:'relay_unavailable'};
      if(relay && typeof relay.enqueueSignal==='function'){
        const rawCode=clean(error instanceof Error ? error.message : error).split(':')[0];
        const errorCode=(rawCode || 'report_generation_failed').replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,96);
        try{
          const queued=relay.enqueueSignal({
            product:'rivet',
            source:'rivet-yard-report-gateway',
            kind:'report_generation_failed',
            component:'owned-yard-gateway',
            error_code:errorCode,
            status:'failed',
            evidence_state:'live_verified',
            impact:'report_generation_failed',
            summary:'RIVET report generation failed in the owned Yard gateway.',
            recipient:'company-ops'
          });
          operator_signal={state:queued?.job?.duplicate?'already_queued':'queued',job_id:queued?.job?.id || null};
        }catch{
          operator_signal={state:'enqueue_failed'};
        }
      }
      res.status(502).json({
        ok:false,
        error:'rivet_report_generation_failed',
        detail:error instanceof Error ? error.message : String(error),
        operator_signal
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
