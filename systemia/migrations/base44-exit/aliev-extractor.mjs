import fs from 'node:fs';
import path from 'node:path';
import { createAliEvSnapshotBundle } from '../../aliev/snapshot-bundle.mjs';

const REQUIRED=[
  'geocoding','charging_inventory','traffic','traffic_temporal','utility_service_area','utility_tariff','incentives',
  'parcel_planning','local_ev_stock','observed_sessions','freight','dwell_context','deep_market_evidence','provenance'
];
const clean=(v)=>String(v??'').trim();

function validate(snapshot,address){
  if(snapshot?.response_profile!=='rivet_report_snapshot_v1') throw new Error('snapshot_profile_invalid:'+address);
  if(snapshot?.access_policy?.commercial_access!==true) throw new Error('commercial_snapshot_required:'+address);
  const manifest=snapshot?.source_coverage_manifest;
  if(manifest?.schema!=='evercraft.rivet.source-coverage.v1') throw new Error('coverage_schema_invalid:'+address);
  const missing=REQUIRED.filter(k=>!manifest.domains?.[k]||!clean(manifest.domains[k]?.state));
  if(missing.length) throw new Error('coverage_incomplete:'+address+':'+missing.join(','));
  return snapshot;
}

export async function extractAliEvSnapshots({
  addresses=[],
  legacyEndpoint,
  systemiaMachineKey,
  outDir,
  sourceFetch=fetch,
  concurrency=4,
}={}){
  const unique=[...new Set(addresses.map(clean).filter(Boolean))];
  if(!unique.length) throw new Error('addresses are required');
  if(!clean(legacyEndpoint)) throw new Error('legacyEndpoint is required');
  if(!clean(systemiaMachineKey)) throw new Error('systemiaMachineKey is required');
  if(!outDir) throw new Error('outDir is required');
  const parsed=new URL(legacyEndpoint);
  if(parsed.protocol!=='https:'&&!['127.0.0.1','localhost','::1'].includes(parsed.hostname)){
    throw new Error('legacy_endpoint_must_use_https');
  }
  const snapshots=new Array(unique.length);
  const receipts=[];
  let cursor=0;
  async function worker(){
    while(true){
      const index=cursor++;
      if(index>=unique.length) return;
      const address=unique[index];
      const response=await sourceFetch(legacyEndpoint,{
        method:'POST',
        headers:{
          'content-type':'application/json',
          'accept':'application/json',
          'x-systemia-machine-key':systemiaMachineKey,
          'user-agent':'Evercraft-Base44-Exit-AliEV-Extractor/1.0',
        },
        body:JSON.stringify({address,mode:'rivet_report_snapshot'})
      });
      const body=await response.json().catch(()=>null);
      if(!response.ok) throw new Error('legacy_snapshot_http_'+response.status+':'+address);
      const snapshot=validate(body,address);
      snapshots[index]=snapshot;
      receipts.push({
        address,
        matched_address:clean(snapshot.matched_address),
        retrieved_at:clean(snapshot.retrieved_at),
        evidence_state:clean(snapshot.evidence_state),
        coverage_domains:REQUIRED.length,
      });
    }
  }
  await Promise.all(Array.from({length:Math.min(Math.max(1,Number(concurrency)||1),8)},()=>worker()));
  const manifest=createAliEvSnapshotBundle({outDir,snapshots});
  const extraction={
    schema:'evercraft.aliev.legacy-extraction-receipt.v1',
    source_role:'migration_only',
    runtime_dependency_created:false,
    addresses_requested:unique.length,
    snapshots_extracted:snapshots.length,
    bundle_manifest_sha256:manifest.manifest_sha256,
    source_endpoint_host:parsed.hostname,
    machine_key_persisted:false,
    machine_key_exposed:false,
    extracted_at:new Date().toISOString(),
    receipts:receipts.sort((a,b)=>a.address.localeCompare(b.address)),
  };
  fs.writeFileSync(path.join(path.resolve(outDir),'extraction-receipt.json'),JSON.stringify(extraction,null,2)+'\n',{mode:0o600});
  return {manifest,extraction};
}

async function main(){
  const args=process.argv.slice(2);
  const value=(name,def='')=>{const i=args.indexOf(name);return i>=0?args[i+1]||def:def;};
  const addressFile=value('--addresses');
  const outDir=value('--out');
  const endpoint=value('--endpoint',process.env.ALIEV_LEGACY_MIGRATION_ENDPOINT||'');
  const key=process.env.SYSTEMIA_MACHINE_KEY||'';
  if(!addressFile) throw new Error('--addresses file required');
  const addresses=fs.readFileSync(path.resolve(addressFile),'utf8').split(/\r?\n/).map(clean).filter(Boolean);
  const result=await extractAliEvSnapshots({addresses,legacyEndpoint:endpoint,systemiaMachineKey:key,outDir});
  console.log(JSON.stringify({
    ok:true,
    schema:result.extraction.schema,
    addresses_requested:result.extraction.addresses_requested,
    snapshots_extracted:result.extraction.snapshots_extracted,
    bundle_manifest_sha256:result.extraction.bundle_manifest_sha256,
    machine_key_exposed:false,
  },null,2));
}

if(import.meta.url===new URL('file://'+process.argv[1]).href){
  main().catch(error=>{console.error(error);process.exitCode=1;});
}
