#!/usr/bin/env node
// Read-only source intake. Deliberately does not render public risk findings or deploy.
import fs from 'node:fs';
import path from 'node:path';
import {acquireIsaiasReadOnly} from '../systemia/newsroom/isaias-agency-acquisition.mjs';

const output=process.argv[process.argv.indexOf('--out')+1];
if(!process.argv.includes('--out')||!output||output.startsWith('--'))throw new Error('explicit_output_path_required');
const pathname=path.resolve(output);
fs.mkdirSync(path.dirname(pathname),{recursive:true,mode:0o700});
try{
  const packet=await acquireIsaiasReadOnly();
  const raw=JSON.stringify(packet,null,2)+'\n';
  fs.writeFileSync(pathname,raw,{mode:0o600});
  const summary={
    state:packet.status,
    advisory:packet.advisory,
    fema_rows_acquired:packet.facilities?.features.length??null,
    fema_state:packet.facility_state,
    fema_error:packet.facility_error,
    records_class:'agency_reported_not_verified_for_public_shelter_instructions',
    sources:packet.source_receipts.map(x=>({id:x.id,sha256:x.sha256,retrieved_at:x.retrieved_at})),
    combined_hazard_intersections:null,
    confirmed_impacts:null,
    artifact_path:pathname
  };
  process.stdout.write(JSON.stringify(summary,null,2)+'\n');
  if(packet.facility_state==='held')process.exitCode=2;
}catch(e){
  const error=e instanceof Error?e.message:String(e);
  if(error==='nhc_advisory_identity_mismatch'){
    // Public source diagnostics only. Show no content, cookies, or request headers.
    try{
      const targets=[
        'https://www.nhc.noaa.gov/mobile/text/refresh/MIATCPAT4%2Bhtml/081456.shtml',
        'https://www.nhc.noaa.gov/archive/2026/al09/al092026.public.008.shtml'
      ];
      for(const url of targets){
        try{
          const x=await fetch(url,{redirect:'manual'});
          const body=await x.text();
          const plain=body.replace(/<[^>]+>/g,' ').replace(/\\s+/g,' ');
          process.stderr.write(JSON.stringify({
            source_probe:url, status:x.status, response_url:x.url,
            length:body.length, nhc_id_present:/AL092026/.test(body),
            title_present:/Isaias/i.test(plain), bulletin_present:/Advisory\\s+Number\\s+8/i.test(plain)
          })+'\\n');
        }catch(ex){process.stderr.write(JSON.stringify({source_probe:url,transport_error:String(ex).slice(0,160)})+'\\n');}
      }
    }catch{}
  }

  const held={
    schema:'evercraft.isaias-agency-readonly-acquisition.v1',
    state:'held_external_source_not_verified',
    failure_reason:error,
    official_facility_rows:null,
    public_hazard_intersections:null,
    confirmed_impacts:null,
    note:'No public claim or shelter opening can be inferred from this held attempt.'
  };
  fs.writeFileSync(pathname,JSON.stringify(held,null,2)+'\n',{mode:0o600});
  process.stderr.write(JSON.stringify(held)+'\n');
  process.exitCode=2;
}
