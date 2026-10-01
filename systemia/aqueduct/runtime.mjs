function clean(value,max=12000){ return String(value??'').trim().slice(0,max); }

export const AQUEDUCT_SEED_EDGES=Object.freeze([
  {edge_key:'aliev.observed-usage->rivet.session-evidence',upstream_product:'AliEV',upstream_surface:'Observed charging usage',downstream_product:'RIVET',downstream_surface:'Report session evidence',purpose:'Move geographically valid observed charging behavior into RIVET reports without converting missing data to zero.',contract_version:'aqueduct.aliev-rivet.sessions.v1',required_fields:['nearby_observed_usage','source_ref','period_start','period_end'],freshness_sla_minutes:1440,delivery_sla_minutes:10,criticality:'critical',auto_repair:'refresh_source',owner:'Systemia'},
  {edge_key:'aliev.site-intelligence->rivet.report',upstream_product:'AliEV',upstream_surface:'Address intelligence snapshot',downstream_product:'RIVET',downstream_surface:'Living EV site report',purpose:'Deliver traffic, charger, utility, incentive and market evidence into the report generator with evidence boundaries intact.',contract_version:'aqueduct.aliev-rivet.site.v1',required_fields:['matched_address','chargers','traffic','source_record_ids'],freshness_sla_minutes:1440,delivery_sla_minutes:10,criticality:'critical',auto_repair:'retry_idempotent',owner:'Systemia'},
  {edge_key:'rivet.report->rivet.pdf',upstream_product:'RIVET',upstream_surface:'Living report',downstream_product:'RIVET',downstream_surface:'Customer PDF',purpose:'Keep downloaded PDF intelligence synchronized with the exact living report revision.',contract_version:'aqueduct.rivet-pdf.v1',required_fields:['decision','traffic','charging'],freshness_sla_minutes:1440,delivery_sla_minutes:5,criticality:'high',auto_repair:'rebuild_artifact',owner:'RIVET'},
  {edge_key:'fallen.finished-media->evercraft-clip',upstream_product:'Fallen',upstream_surface:'Finished media',downstream_product:'Evercraft Clip',downstream_surface:'Distribution queue',purpose:'Prevent completed media from becoming stranded before publishing.',contract_version:'aqueduct.fallen-clip.v1',required_fields:['asset_ref','provenance','publish_state'],freshness_sla_minutes:360,delivery_sla_minutes:15,criticality:'high',auto_repair:'retry_idempotent',owner:'Systemia'},
  {edge_key:'journal.verified-story->evercraft-clip',upstream_product:'Evercraft Journal',upstream_surface:'Verified publishable story',downstream_product:'Evercraft Clip',downstream_surface:'Distribution queue',purpose:'Ensure newsroom output reaches approved distribution destinations with source lineage.',contract_version:'aqueduct.journal-clip.v1',required_fields:['story_ref','evidence_state','asset_refs'],freshness_sla_minutes:360,delivery_sla_minutes:15,criticality:'high',auto_repair:'retry_idempotent',owner:'Systemia'},
  {edge_key:'towi.report->journal-newsroom',upstream_product:'TOWI',upstream_surface:'Verified report',downstream_product:'Journal Newsroom OS',downstream_surface:'Education and publication intake',purpose:'Ensure completed TOWI research enters the newsroom instead of stopping at analysis.',contract_version:'aqueduct.towi-journal.v1',required_fields:['report_ref','evidence_state','source_refs'],freshness_sla_minutes:720,delivery_sla_minutes:20,criticality:'high',auto_repair:'retry_idempotent',owner:'Systemia'},
  {edge_key:'systemia.radar->journal-newsroom',upstream_product:'Systemia Radar',upstream_surface:'Real-world signal briefing',downstream_product:'Journal Newsroom OS',downstream_surface:'Verified briefing intake',purpose:'Carry real-world signal analysis into publishable educational output while preserving observed/inferred/modeled labels.',contract_version:'aqueduct.radar-journal.v1',required_fields:['brief_ref','evidence_state','source_refs'],freshness_sla_minutes:1440,delivery_sla_minutes:20,criticality:'high',auto_repair:'retry_idempotent',owner:'Systemia'},
  {edge_key:'eventwave.verified-event->omnicore.trip',upstream_product:'EventWave',upstream_surface:'Verified event',downstream_product:'Omnicore',downstream_surface:'Trip itinerary',purpose:'Move verified event options into trip planning without implying ticket ownership.',contract_version:'aqueduct.eventwave-omnicore.v1',required_fields:['event_ref','verification_state','source_ref'],freshness_sla_minutes:1440,delivery_sla_minutes:30,criticality:'medium',auto_repair:'retry_idempotent',owner:'Systemia'},
  {edge_key:'forensiscope.evidence->llm-consumer',upstream_product:'ForensiScope',upstream_surface:'Provenance-preserved evidence bundle',downstream_product:'Evercraft Fabric',downstream_surface:'LLM-consumable evidence output',purpose:'Ensure long-media evidence exits ForensiScope as compact provenance-preserved machine-readable output.',contract_version:'aqueduct.forensiscope-fabric.v1',required_fields:['evidence_ref','provenance','timeline'],freshness_sla_minutes:1440,delivery_sla_minutes:20,criticality:'high',auto_repair:'rebuild_artifact',owner:'Systemia'},
  {edge_key:'evercraft-sign.signature->completed-envelope',upstream_product:'Evercraft Sign',upstream_surface:'Signer receipt',downstream_product:'Evercraft Sign',downstream_surface:'Completed envelope',purpose:'Ensure every valid signature advances envelope completion and audit-chain state.',contract_version:'aqueduct.sign-completion.v1',required_fields:['signer_id','document_hash','receipt_hash','signed_at'],freshness_sla_minutes:43200,delivery_sla_minutes:2,criticality:'critical',auto_repair:'retry_idempotent',owner:'Evercraft Sign'}
]);

function severity(edge,hard=false){
  if(edge?.criticality==='critical') return hard?'critical':'high';
  if(edge?.criticality==='high') return hard?'high':'warning';
  return hard?'warning':'info';
}

export class EvercraftAqueductRuntime {
  constructor({
    entityStore,
    appKey='systemia-command-center',
    clock=()=>new Date()
  }={}){
    if(!entityStore) throw new Error('aqueduct_entity_store_required');
    this.entityStore=entityStore;
    this.appKey=clean(appKey,127);
    if(!this.appKey) throw new Error('aqueduct_app_key_required');
    this.clock=clock;
  }

  now(){ return this.clock().toISOString(); }

  ageMinutes(value){
    const t=new Date(String(value||'')).getTime();
    return Number.isFinite(t)?(this.clock().getTime()-t)/60000:Infinity;
  }

  edgeByKey(key){
    return this.entityStore.filter(
      this.appKey,'PipelineEdge',{edge_key:clean(key,500)},{sort:'-updated_at',limit:5}
    )[0]||null;
  }

  receiptsFor(key){
    return this.entityStore.filter(
      this.appKey,'PipelineReceipt',{edge_key:clean(key,500)},{sort:'-occurred_at',limit:250}
    );
  }

  upsertIncident(edge,type,diagnosis,remediation,evidence,hard=false){
    const open=this.entityStore.filter(this.appKey,'PipelineIncident',{
      edge_key:edge.edge_key,
      incident_type:type,
      status:{$in:['open','observing']}
    },{sort:'-opened_at',limit:5});
    const stamp=this.now();
    const patch={
      severity:severity(edge,hard),
      status:'open',
      diagnosis,
      remediation,
      evidence_json:JSON.stringify(evidence||{}),
      updated_at:stamp
    };
    if(open[0]?.id){
      return this.entityStore.update(this.appKey,'PipelineIncident',open[0].id,patch).record;
    }
    return this.entityStore.create(this.appKey,'PipelineIncident',{
      incident_key:edge.edge_key+':'+type+':'+this.clock().getTime(),
      edge_key:edge.edge_key,
      incident_type:type,
      ...patch,
      opened_at:stamp
    }).record;
  }

  resolveOtherIncidents(edgeKey,activeTypes){
    const rows=this.entityStore.filter(this.appKey,'PipelineIncident',{
      edge_key:edgeKey,
      status:{$in:['open','observing']}
    },{sort:'-opened_at',limit:100});
    for(const row of rows){
      if(!activeTypes.has(clean(row.incident_type))){
        this.entityStore.update(this.appKey,'PipelineIncident',row.id,{
          status:'resolved',
          resolved_at:this.now(),
          updated_at:this.now()
        });
      }
    }
  }

  latestStage(receipts,stage){
    return receipts.find((row)=>clean(row.stage)===stage)||null;
  }

  evaluateEdge(edge){
    const receipts=this.receiptsFor(edge.edge_key);
    const produced=this.latestStage(receipts,'produced');
    const delivered=this.latestStage(receipts,'delivered');
    const consumed=this.latestStage(receipts,'consumed');
    const verified=this.latestStage(receipts,'verified');
    const active=new Set();
    const evidence={
      produced:produced?.occurred_at||null,
      delivered:delivered?.occurred_at||null,
      consumed:consumed?.occurred_at||null,
      verified:verified?.occurred_at||null
    };
    let state='healthy',reason='';

    if(!receipts.length){
      state='unverified';
      reason='No stage receipts have been emitted for this intended edge.';
      active.add('uninstrumented');
      this.upsertIncident(
        edge,'uninstrumented',reason,
        'Instrument the producer and consumer so both sides emit artifact-bound receipts. Never infer health from intended architecture.',
        evidence,false
      );
    }else{
      const freshLimit=Math.max(1,Number(edge.freshness_sla_minutes||1440));
      const deliveryLimit=Math.max(1,Number(edge.delivery_sla_minutes||10));

      if(!produced||this.ageMinutes(produced.occurred_at)>freshLimit){
        state='degraded';
        reason='Producer freshness SLA has expired.';
        active.add('stale_source');
        this.upsertIncident(
          edge,'stale_source',reason,
          'Refresh the upstream source or producer. Missing freshness must not be converted to a healthy zero.',
          {...evidence,freshness_sla_minutes:freshLimit},false
        );
      }

      if(produced){
        const producedHash=clean(produced.artifact_hash);
        const deliveredHash=clean(delivered?.artifact_hash);
        const elapsed=delivered
          ?Math.max(0,(new Date(delivered.occurred_at)-new Date(produced.occurred_at))/60000)
          :this.ageMinutes(produced.occurred_at);

        if((!delivered||!deliveredHash||deliveredHash!==producedHash)&&elapsed>deliveryLimit){
          state='broken';
          reason='Fresh upstream output exists without a matching downstream delivery receipt.';
          active.add('drain');
          this.upsertIncident(
            edge,'drain',reason,
            'Retry only the idempotent handoff for this exact artifact, then require delivery and consumption receipts before clearing the incident.',
            {...evidence,artifact_hash:producedHash,delivery_sla_minutes:deliveryLimit},true
          );
        }else if(delivered&&producedHash&&deliveredHash===producedHash){
          const consumerElapsed=consumed
            ?Math.max(0,(new Date(consumed.occurred_at)-new Date(delivered.occurred_at))/60000)
            :this.ageMinutes(delivered.occurred_at);
          if((!consumed||clean(consumed.artifact_hash)!==producedHash)&&consumerElapsed>deliveryLimit){
            state='broken';
            reason='Delivery reached the downstream boundary but no matching consumption receipt followed.';
            active.add('consumer_gap');
            this.upsertIncident(
              edge,'consumer_gap',reason,
              'Inspect the downstream reader, schema mapping and trigger. Do not mark the pipeline healthy until the consumer receipts the same artifact.',
              {...evidence,artifact_hash:producedHash},true
            );
          }
        }

        const versions=[produced,delivered,consumed,verified]
          .filter(Boolean)
          .map((row)=>clean(row.contract_version))
          .filter(Boolean);
        if(versions.some((value)=>value!==clean(edge.contract_version))){
          state='broken';
          reason='At least one stage is running a different contract version.';
          active.add('schema_drift');
          this.upsertIncident(
            edge,'schema_drift',reason,
            'Align the producer and consumer on the registered contract, then re-emit receipts for a new artifact revision.',
            {...evidence,expected:edge.contract_version,observed:[...new Set(versions)]},true
          );
        }

        const required=Array.isArray(edge.required_fields)?edge.required_fields:[];
        const producedFields=Array.isArray(produced.field_names)?produced.field_names:[];
        const missing=required.filter((field)=>!producedFields.includes(field));
        if(missing.length){
          state='broken';
          reason='Producer receipt is missing required contract fields.';
          active.add('schema_drift');
          this.upsertIncident(
            edge,'schema_drift',reason,
            'Restore required contract fields upstream. Do not silently synthesize missing fields downstream.',
            {...evidence,missing_required_fields:missing},true
          );
        }

        if(Number(produced.record_count)===0 &&
          !['observed_zero','not_applicable'].includes(clean(produced.zero_semantics))){
          state='broken';
          reason='Zero records were emitted without an observed-zero or not-applicable semantic.';
          active.add('silent_zero');
          this.upsertIncident(
            edge,'silent_zero',reason,
            'Resolve whether the source truly observed zero or the data is missing. Missing is never zero.',
            {...evidence,zero_semantics:produced.zero_semantics||'unknown'},true
          );
        }

        if(state==='healthy'&&(!verified||clean(verified.artifact_hash)!==producedHash)){
          state='degraded';
          reason='Artifact moved, but exact downstream verification has not receipted the current artifact.';
        }
      }
    }

    const patch={
      state,
      last_checked_at:this.now(),
      last_produced_at:produced?.occurred_at||null,
      last_delivered_at:delivered?.occurred_at||null,
      last_consumed_at:consumed?.occurred_at||null,
      last_verified_at:verified?.occurred_at||null,
      last_artifact_hash:produced?.artifact_hash||null,
      consecutive_failures:['broken','degraded'].includes(state)
        ?Number(edge.consecutive_failures||0)+1
        :0,
      blockage_reason:reason,
      evidence_json:JSON.stringify(evidence),
      updated_at:this.now()
    };
    const updated=this.entityStore.update(this.appKey,'PipelineEdge',edge.id,patch).record;
    this.resolveOtherIncidents(edge.edge_key,active);
    return {...updated,receipts:receipts.slice(0,12)};
  }

  seed(){
    let created=0,existing=0;
    for(const spec of AQUEDUCT_SEED_EDGES){
      const have=this.edgeByKey(spec.edge_key);
      if(have){ existing++; continue; }
      this.entityStore.create(this.appKey,'PipelineEdge',{
        ...spec,
        state:'unverified',
        consecutive_failures:0,
        created_at:this.now(),
        updated_at:this.now()
      });
      created++;
    }
    return {ok:true,action:'seed',created,existing,total:AQUEDUCT_SEED_EDGES.length};
  }

  emit(body={},actor='systemia-machine'){
    const edgeKey=clean(body.edge_key,500);
    const stage=clean(body.stage,80);
    const edge=this.edgeByKey(edgeKey);
    if(!edge) throw new Error('edge_not_registered');
    if(!['produced','delivered','consumed','verified','failed'].includes(stage)){
      throw new Error('invalid_stage');
    }
    const artifactHash=clean(body.artifact_hash,500);
    if(!artifactHash&&stage!=='failed') throw new Error('artifact_hash_required');
    const receiptKey=clean(body.receipt_key,1000) ||
      edgeKey+':'+stage+':'+(artifactHash||'failed')+':'+this.clock().getTime();
    const created=this.entityStore.create(this.appKey,'PipelineReceipt',{
      receipt_key:receiptKey,
      edge_key:edgeKey,
      stage,
      artifact_key:clean(body.artifact_key,1000),
      artifact_hash:artifactHash,
      contract_version:clean(body.contract_version,500)||edge.contract_version,
      field_names:Array.isArray(body.field_names)?body.field_names.map((x)=>clean(x,500)).filter(Boolean):[],
      record_count:Number.isFinite(Number(body.record_count))?Number(body.record_count):null,
      zero_semantics:clean(body.zero_semantics,120)||'unknown',
      source_app_id:clean(body.source_app_id,500),
      target_app_id:clean(body.target_app_id,500),
      evidence_state:clean(body.evidence_state,500),
      payload_summary_json:JSON.stringify(body.payload_summary||{}),
      occurred_at:clean(body.occurred_at,100)||this.now(),
      actor:clean(actor,500)
    }).record;
    return {ok:true,action:'emit',receipt:created,edge:this.evaluateEdge(edge)};
  }

  sweep(){
    const edges=this.entityStore.list(this.appKey,'PipelineEdge',{sort:'-updated_at',limit:500});
    const results=edges.map((edge)=>this.evaluateEdge(edge));
    const counts=results.reduce((acc,edge)=>{
      acc[edge.state]=(acc[edge.state]||0)+1;
      return acc;
    },{});
    return {ok:true,action:'sweep',evaluated:results.length,counts,edges:results};
  }

  resolveIncident({incident_key,remediation}={}){
    const rows=this.entityStore.filter(this.appKey,'PipelineIncident',{
      incident_key:clean(incident_key,1000)
    },{sort:'-opened_at',limit:5});
    const incident=rows[0];
    if(!incident) throw new Error('incident_not_found');
    const updated=this.entityStore.update(this.appKey,'PipelineIncident',incident.id,{
      status:'resolved',
      resolved_at:this.now(),
      updated_at:this.now(),
      remediation:clean(remediation,4000)||incident.remediation
    }).record;
    return {ok:true,action:'resolve-incident',incident:updated};
  }

  graph(){
    const edges=this.entityStore.list(this.appKey,'PipelineEdge',{sort:'-updated_at',limit:500});
    const incidents=this.entityStore.filter(this.appKey,'PipelineIncident',{
      status:{$in:['open','observing']}
    },{sort:'-opened_at',limit:500});
    const counts=edges.reduce((acc,edge)=>{
      acc[edge.state]=(acc[edge.state]||0)+1;
      return acc;
    },{});
    return {
      ok:true,
      product:'Systemia Aqueduct',
      mission:'No useful output dies in transit.',
      counts,
      open_incidents:incidents.length,
      edges,
      incidents,
      doctrine:[
        'Producer success is not pipeline health.',
        'Fresh output without a matching delivery receipt is a drain.',
        'Delivery without a matching consumption receipt is a blockage.',
        'Missing is never zero.',
        'Schema drift breaks the edge until the same artifact is verified end to end.'
      ]
    };
  }

  health(){
    return {
      schema:'evercraft.aqueduct.health.v1',
      state:'healthy',
      owned_entity_store:true,
      seed_edge_count:AQUEDUCT_SEED_EDGES.length,
      source_platform_dependency:false,
      automatic_external_repair:false
    };
  }
}
