import {readFile,writeFile} from 'node:fs/promises';
import {buildAggregateResearchDossiers} from './research-dossiers.mjs';

const directory=process.env.EVERMAPS_OUTPUT_DIR||'evermaps-grant-full-evidence';
const county=process.env.EVERMAPS_COUNTY||'Grant';
try {
  const source=JSON.parse(await readFile(directory+'/wgs-resources.geojson','utf8'));
  const receipt=JSON.parse(await readFile(directory+'/wgs-full-import-receipt.json','utf8'));
  const dossiers=buildAggregateResearchDossiers({source,receipt,county});
  await writeFile(directory+'/wgs-research-dossiers.json',JSON.stringify(dossiers,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({
    source:county,records:dossiers.record_count,
    commercial_eligibility:dossiers.commercial_eligibility,
    status:'research_only_provenance_verified'
  }));
} catch(error) {
  console.error('Research dossier export held:',String(error?.message??error));
  process.exitCode=1;
}
