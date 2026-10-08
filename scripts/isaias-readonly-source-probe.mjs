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
    fema_rows_acquired:packet.facilities.features.length,
    records_class:'agency_reported_not_verified_for_public_shelter_instructions',
    sources:packet.source_receipts.map(x=>({id:x.id,sha256:x.sha256,retrieved_at:x.retrieved_at})),
    combined_hazard_intersections:null,
    confirmed_impacts:null,
    artifact_path:pathname
  };
  process.stdout.write(JSON.stringify(summary,null,2)+'\n');
}catch(e){
  const error=e instanceof Error?e.message:String(e);
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
