import {readFile,writeFile} from 'node:fs/promises';
import {evaluateResearchSourceHealth} from './research-source-health.mjs';
const dir=process.env.EVERMAPS_OUTPUT_DIR||'evermaps-grant-full-evidence';
const files={
 geology:'wgs-full-import-receipt.json',
 dossiers:'wgs-research-dossiers.json',
 land:'land-source-coverage-receipt.json',
 planning:'grant-planning-context-receipt.json',
 permitPoints:'wa-dnr-permit-point-overlay-receipt.json',
 study:'wgs-study-publisher-spatial-join-receipt.json'
};
const inputs={};
for(const [key,name] of Object.entries(files)){
 try{inputs[key]=JSON.parse(await readFile(dir+'/'+name,'utf8'));}
 catch(error){inputs[key]={error:'missing_or_unreadable',reason:String(error?.message??error)};}
}
const report={...evaluateResearchSourceHealth(inputs),observed_at:new Date().toISOString(),county:'Grant'};
await writeFile(dir+'/source-health-manifest.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report,null,2));
if(!report.required_research_dependencies_complete)process.exitCode=1;
