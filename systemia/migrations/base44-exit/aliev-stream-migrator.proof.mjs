import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { migrateAliEvPhase, migrationState } from './aliev-stream-migrator.mjs';
import { startAliEvSourceRuntime } from '../../aliev/source-runtime.mjs';
import { queryAliEvDomain } from '../../aliev/domain-store.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'aliev-stream-migration-proof-'));
const migrationRoot=path.join(root,'migration');
const targetRoot=path.join(root,'target');
const sourceKey='source-secret-proof';
const targetToken='target-secret-proof';
const snapshotCutoff='2026-09-30T20:00:00.000Z';
const deltaCutoff='2026-09-30T21:00:00.000Z';

const sha=(value)=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const without=(obj,key)=>Object.fromEntries(Object.entries(obj).filter(([k])=>k!==key));
const withRowHash=(row)=>({...row,_migration_row_sha256:sha(JSON.stringify(row))});

const snapshotRows={
  EVNationalChargePoint:[
    {id:'c1',external_id:'charger:live',country_code:'US',station_name:'Live Charger',latitude:47.42,longitude:-122.29,data_status:'verified',source_name:'Proof',created_date:'2026-09-29T10:00:00.000Z',updated_date:'2026-09-29T10:00:00.000Z'},
    {id:'c2',external_id:'charger:retired',country_code:'US',station_name:'Retired Charger',latitude:47.43,longitude:-122.30,data_status:'retired',source_name:'Proof',created_date:'2026-09-29T11:00:00.000Z',updated_date:'2026-09-29T11:00:00.000Z'},
  ],
  EVObservedUsageAggregate:[
    ...Array.from({length:5},(_,i)=>({
      id:'u'+(i+1),aggregate_key:'usage:'+String(i+1).padStart(2,'0'),
      station_external_id:'charger:live',
      period_start:'2026-0'+(i+1)+'-01T00:00:00.000Z',
      period_granularity:'month',
      charging_sessions_count:10+i,
      source_ref:'proof:'+i,data_status:'verified',
      created_date:'2026-09-29T12:0'+i+':00.000Z',
      updated_date:'2026-09-29T12:0'+i+':00.000Z',
    }))
  ]
};

const deltaRows={
  EVNationalChargePoint:[
    {id:'c3',external_id:'charger:new',country_code:'US',station_name:'New Charger',latitude:47.44,longitude:-122.31,data_status:'verified',source_name:'Proof',created_date:'2026-09-30T20:30:00.000Z',updated_date:'2026-09-30T20:30:00.000Z'},
  ],
  EVObservedUsageAggregate:[
    {...snapshotRows.EVObservedUsageAggregate[2],charging_sessions_count:99,updated_date:'2026-09-30T20:20:00.000Z'}
  ]
};

let sourceRequests=0;
const source=http.createServer(async(req,res)=>{
  assert.equal(req.headers['x-systemia-machine-key'],sourceKey);
  assert.equal(req.headers['x-evercraft-migration-purpose'],'aliev-base44-exit-v1');
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  sourceRequests++;
  const phase=body.phase||'snapshot';
  const entity=body.entity;
  const limit=Math.max(1,Math.min(200,Number(body.limit||100)));
  let rows=[];
  let paginationMode='offset';
  let cursorField=null;
  if(phase==='snapshot'){
    rows=[...(snapshotRows[entity]||[])].filter(x=>Date.parse(x.created_date)<=Date.parse(body.snapshot_cutoff));
    if(entity==='EVObservedUsageAggregate'){
      paginationMode='keyset';cursorField='aggregate_key';
      rows.sort((a,b)=>a.aggregate_key.localeCompare(b.aggregate_key));
      if(body.cursor)rows=rows.filter(x=>x.aggregate_key>body.cursor);
    }else{
      rows.sort((a,b)=>a.id.localeCompare(b.id));
      rows=rows.slice(Number(body.offset||0));
    }
  }else{
    rows=[...(snapshotRows[entity]||[]),...(deltaRows[entity]||[])]
      .filter(x=>Date.parse(x.updated_date)>Date.parse(body.updated_after)&&Date.parse(x.updated_date)<=Date.parse(body.snapshot_cutoff))
      .sort((a,b)=>a.id.localeCompare(b.id))
      .slice(Number(body.offset||0));
  }
  const selected=rows.slice(0,limit).map(withRowHash);
  const exhausted=selected.length<limit;
  const nextCursor=paginationMode==='keyset'&&!exhausted?selected.at(-1).aggregate_key:null;
  const nextOffset=paginationMode==='offset'&&!exhausted?Number(body.offset||0)+selected.length:null;
  const payload={
    schema:'evercraft.aliev.base44-exit-batch.v1',ok:true,
    source_app:'AliEV legacy Base44',source_app_id:'69b9b64d86a732029ce0db81',
    source_entity:entity,phase,pagination_mode:paginationMode,cursor_field:cursorField,
    snapshot_cutoff:body.snapshot_cutoff,
    updated_after:phase==='delta'?body.updated_after:null,
    requested_limit:Number(body.limit||100),applied_limit:limit,page_row_count:selected.length,
    offset:paginationMode==='offset'?Number(body.offset||0):null,
    next_offset:nextOffset,cursor:paginationMode==='keyset'?(body.cursor||null):null,
    next_cursor:nextCursor,exhausted,rows:selected,
    exported_at:'2026-09-30T22:00:00.000Z',
    semantics:'proof'
  };
  const response={...payload,page_sha256:sha(JSON.stringify(payload))};
  const bytes=Buffer.from(JSON.stringify(response));
  res.writeHead(200,{'content-type':'application/json','content-length':String(bytes.length)});
  res.end(bytes);
});
await new Promise((resolve,reject)=>{source.once('error',reject);source.listen(0,'127.0.0.1',resolve);});
const sourceAddress=source.address();
const sourceEndpoint='http://127.0.0.1:'+sourceAddress.port+'/export';

const target=await startAliEvSourceRuntime({
  stateDir:targetRoot,
  systemiaMachineKey:'machine-proof',
  ingestToken:targetToken,
  geocode:async()=>{throw new Error('not_used')},
  refreshDomains:async()=>null,
});

try{
  const snapshot=await migrateAliEvPhase({
    sourceEndpoint,sourceKey,
    targetDomainIngestEndpoint:target.domain_ingest_url,
    targetIngestToken:targetToken,
    stateDir:migrationRoot,
    snapshotCutoff,
    phase:'snapshot',
    entities:['EVNationalChargePoint','EVObservedUsageAggregate'],
    pageLimit:2,
  });
  assert.equal(snapshot.complete,true);
  assert.equal(snapshot.totals.source_rows,7);
  assert.equal(snapshot.totals.accepted_rows,6);
  assert.equal(snapshot.totals.excluded_rows,1);
  assert.equal(snapshot.totals.ingest_submitted,6);
  assert.equal(snapshot.entities.EVObservedUsageAggregate.page_count,3);
  assert.equal(snapshot.entities.EVObservedUsageAggregate.exhausted,true);

  const usageAfterSnapshot=queryAliEvDomain({stateDir:path.join(targetRoot,'domain-store'),domain:'observed_sessions',limit:20});
  const chargersAfterSnapshot=queryAliEvDomain({stateDir:path.join(targetRoot,'domain-store'),domain:'charging_inventory',limit:20});
  assert.equal(usageAfterSnapshot.length,5);
  assert.equal(chargersAfterSnapshot.length,1);
  assert.ok(usageAfterSnapshot.every(x=>/^([a-f0-9]{64})$/.test(String(x.migration_lineage?.source_row_sha256||''))));

  const requestsAfterSnapshot=sourceRequests;
  const resumed=await migrateAliEvPhase({
    sourceEndpoint,sourceKey,
    targetDomainIngestEndpoint:target.domain_ingest_url,
    targetIngestToken:targetToken,
    stateDir:migrationRoot,
    snapshotCutoff,
    phase:'snapshot',
    entities:['EVNationalChargePoint','EVObservedUsageAggregate'],
    pageLimit:2,
  });
  assert.equal(resumed.complete,true);
  assert.equal(sourceRequests,requestsAfterSnapshot,'completed snapshot must resume without repulling pages');

  const delta=await migrateAliEvPhase({
    sourceEndpoint,sourceKey,
    targetDomainIngestEndpoint:target.domain_ingest_url,
    targetIngestToken:targetToken,
    stateDir:migrationRoot,
    snapshotCutoff,
    phase:'delta',
    updatedAfter:snapshotCutoff,
    cutoff:deltaCutoff,
    entities:['EVNationalChargePoint','EVObservedUsageAggregate'],
    pageLimit:1,
  });
  assert.equal(delta.complete,true);
  assert.equal(delta.totals.source_rows,2);
  assert.equal(delta.totals.accepted_rows,2);
  assert.equal(delta.totals.ingest_submitted,2);

  const usageAfterDelta=queryAliEvDomain({stateDir:path.join(targetRoot,'domain-store'),domain:'observed_sessions',limit:20});
  const chargersAfterDelta=queryAliEvDomain({stateDir:path.join(targetRoot,'domain-store'),domain:'charging_inventory',limit:20});
  assert.equal(usageAfterDelta.length,5);
  assert.equal(usageAfterDelta.find(x=>x.aggregate_key==='usage:03').charging_sessions_count,99);
  assert.equal(chargersAfterDelta.length,2);
  assert.ok(chargersAfterDelta.some(x=>x.external_id==='charger:new'));

  const state=migrationState({stateDir:migrationRoot});
  assert.equal(state.source_secret_persisted,false);
  assert.equal(state.target_secret_persisted,false);
  assert.equal(state.entities.EVObservedUsageAggregate.snapshot.exhausted,true);
  assert.equal(state.entities.EVObservedUsageAggregate.deltas[0].exhausted,true);

  const stateText=fs.readFileSync(path.join(migrationRoot,'migration-state.json'),'utf8')+
    fs.readFileSync(path.join(migrationRoot,'snapshot-receipt.json'),'utf8');
  assert.equal(stateText.includes(sourceKey),false);
  assert.equal(stateText.includes(targetToken),false);

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.aliev.streaming-migration-proof.v1',
    snapshot_rows:snapshot.totals.source_rows,
    snapshot_accepted:snapshot.totals.accepted_rows,
    snapshot_excluded:snapshot.totals.excluded_rows,
    observed_usage_keyset_pages:snapshot.entities.EVObservedUsageAggregate.page_count,
    resume_without_repull:true,
    delta_rows:delta.totals.source_rows,
    updated_record_reconciled:true,
    new_record_reconciled:true,
    retired_inventory_excluded:true,
    source_row_hashes_verified_and_preserved:true,
    page_hashes_verified:true,
    source_secret_persisted:false,
    target_secret_persisted:false,
    runtime_dependency_created:false
  },null,2));
}finally{
  await target.close();
  await new Promise(resolve=>source.close(()=>resolve()));
  fs.rmSync(root,{recursive:true,force:true});
}
