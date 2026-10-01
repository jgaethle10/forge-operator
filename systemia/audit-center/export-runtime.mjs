function clean(value,max=12000){ return String(value??'').trim().slice(0,max); }
function exactOne(rows,label){
  if(!Array.isArray(rows)||rows.length!==1) throw new Error(rows?.length?label+'_ambiguous':label+'_not_found');
  return rows[0];
}
function severityRank(value){
  return ({Critical:0,High:1,Medium:2,Low:3})[String(value)]??4;
}
function priorityRank(value){
  return ({P0:0,P1:1,P2:2,P3:3})[String(value)]??4;
}
function stripHtml(value){ return clean(value).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim(); }

export function buildAuditExportModel({
  audit,client,site,report,findings=[],fixTasks=[],generatedAt=new Date()
}={}){
  if(!audit?.id) throw new Error('audit_export_audit_required');
  if(!client?.id) throw new Error('audit_export_client_required');
  if(!site?.id) throw new Error('audit_export_site_required');
  if(!report?.id) throw new Error('audit_export_report_required');

  return {
    schema:'evercraft.audit-center.export-model.v1',
    generated_at:new Date(generatedAt).toISOString(),
    audit:{
      id:String(audit.id),
      scope:clean(audit.scope,500),
      overall_score:audit.overall_score==null?null:Number(audit.overall_score)
    },
    client:{
      id:String(client.id),
      business_name:clean(client.business_name,500)
    },
    site:{
      id:String(site.id),
      domain:clean(site.domain,1000)
    },
    executive_summary:stripHtml(report.exec_summary),
    offer_ladder:stripHtml(report.offer_ladder),
    findings:[...findings]
      .sort((a,b)=>severityRank(a.severity)-severityRank(b.severity))
      .slice(0,10)
      .map((row)=>({
        id:String(row.id||''),
        title:clean(row.title,1000),
        severity:clean(row.severity,40),
        recommended_fix:clean(row.recommended_fix,4000)
      })),
    patch_plan:[...fixTasks]
      .sort((a,b)=>priorityRank(a.priority)-priorityRank(b.priority))
      .slice(0,15)
      .map((row)=>({
        id:String(row.id||''),
        task:clean(row.task,1600),
        priority:clean(row.priority,40),
        estimate_hours:row.estimate_hours==null?null:Number(row.estimate_hours)
      }))
  };
}

export class EvercraftAuditExportRuntime {
  constructor({
    appKey='systemia-audit-center',
    entityStore,
    objectStore,
    objectDelivery,
    renderPdf,
    authorize=async()=>false,
    clock=()=>new Date()
  }={}){
    if(!entityStore) throw new Error('audit_export_entity_store_required');
    if(!objectStore||typeof objectStore.put!=='function') throw new Error('audit_export_object_store_required');
    if(!objectDelivery||typeof objectDelivery.issueReadUrl!=='function') throw new Error('audit_export_delivery_required');
    if(typeof renderPdf!=='function') throw new Error('audit_export_renderer_required');
    if(typeof authorize!=='function') throw new Error('audit_export_authorizer_required');
    this.appKey=clean(appKey,127);
    this.entityStore=entityStore;
    this.objectStore=objectStore;
    this.objectDelivery=objectDelivery;
    this.renderPdf=renderPdf;
    this.authorize=authorize;
    this.clock=clock;
  }

  async exportAudit({auditId,subjectRef}={}){
    const id=clean(auditId,255);
    const subject=clean(subjectRef,255);
    if(!id) throw new Error('audit_id_required');
    if(!subject) throw new Error('audit_export_subject_required');
    if(await this.authorize({appKey:this.appKey,auditId:id,subjectRef:subject})!==true){
      throw new Error('audit_export_unauthorized');
    }

    const audit=exactOne(this.entityStore.filter(this.appKey,'Audit',{id},{limit:2}),'audit');
    const client=exactOne(this.entityStore.filter(this.appKey,'Client',{id:audit.client_id},{limit:2}),'client');
    const site=exactOne(this.entityStore.filter(this.appKey,'Site',{id:audit.site_id},{limit:2}),'site');
    const report=exactOne(this.entityStore.filter(this.appKey,'Report',{audit_id:id},{limit:2}),'report');
    const findings=this.entityStore.filter(this.appKey,'Finding',{audit_id:id},{limit:500});
    const fixTasks=this.entityStore.filter(this.appKey,'FixTask',{audit_id:id},{limit:500});

    const model=buildAuditExportModel({
      audit,client,site,report,findings,fixTasks,generatedAt:this.clock()
    });
    const rendered=await this.renderPdf(model);
    const bytes=Buffer.isBuffer(rendered)?Buffer.from(rendered):Buffer.from(rendered??'');
    if(bytes.length<5||bytes.subarray(0,5).toString('ascii')!=='%PDF-'){
      throw new Error('audit_export_renderer_invalid_pdf');
    }

    const stored=this.objectStore.put(this.appKey,bytes,{
      name:'systemia-audit-'+id+'.pdf',
      contentType:'application/pdf',
      metadata:{
        artifact_type:'audit_report_pdf',
        audit_id:id,
        report_id:String(report.id),
        generated_at:this.clock().toISOString()
      },
      now:this.clock()
    });
    const fileUrl=await this.objectDelivery.issueReadUrl(
      this.appKey,
      stored.reference.object_ref,
      {ttlSeconds:3600}
    );
    const updated=this.entityStore.update(this.appKey,'Report',report.id,{
      exported_pdf:fileUrl,
      exported_pdf_object_ref:stored.reference.object_ref,
      exported_pdf_sha256:stored.reference.blob_sha256,
      exported_pdf_generated_at:this.clock().toISOString()
    }).record;

    return {
      ok:true,
      file_url:fileUrl,
      object_ref:stored.reference.object_ref,
      blob_sha256:stored.reference.blob_sha256,
      size_bytes:stored.reference.size_bytes,
      report:updated,
      source_platform_dependency:false
    };
  }

  health(){
    return {
      schema:'evercraft.audit-center.export-health.v1',
      state:'healthy',
      owned_object_store:true,
      signed_delivery_urls:true,
      raw_filesystem_paths_exposed:false,
      base44_upload_dependency:false
    };
  }
}
