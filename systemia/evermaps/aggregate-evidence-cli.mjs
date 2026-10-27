import {writeFile} from 'node:fs/promises';
import {createWgsEvidencePacket} from './aggregate-evidence.mjs';

const county=process.argv[2]||'Grant';
const prefix=process.argv[3]||'evermaps-wgs-evidence';
try {
  const packet=await createWgsEvidencePacket({county});
  const output=prefix+'.json';
  await writeFile(output,JSON.stringify(packet,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({
    schema:packet.schema,county:packet.county,status:packet.status,
    layer_counts:Object.fromEntries(Object.entries(packet.summary.source_layer_counts)
      .map(([k,v])=>[k,{count:v.count_after,fetched:v.fetched_features,complete:v.complete}])),
    output,warning:'Regional screening evidence only. Not a mining site recommendation.'
  },null,2));
  if (packet.status!=='evidence_for_human_review') process.exitCode=2;
} catch(error) {
  console.error('Evidence packet aborted: '+error.message);
  process.exitCode=1;
}
