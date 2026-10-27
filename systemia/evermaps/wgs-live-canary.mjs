/** Read-only public-source availability receipt. Never infers mining suitability. */
import {writeFile} from 'node:fs/promises';
import {wgsEvidenceQuery,WGS_EVIDENCE_LAYERS} from './aggregate-evidence.mjs';

const county=process.env.EVERMAPS_COUNTY||'Yakima';
const output=process.env.EVERMAPS_RECEIPT_FILE||'wgs-source-receipt.json';
const stamp=new Date().toISOString();
const receipt={
  schema:'evercraft.evermaps.wgs-source-canary.v1',observed_at:stamp,county,
  status:'unverified',datasets:{},scope:'source-metadata-count-only',
  warning:'Record count is not prospectivity, land availability, permit eligibility or mineability.'
};
for (const kind of Object.keys(WGS_EVIDENCE_LAYERS)) {
  const url=wgsEvidenceQuery({kind,county,countOnly:true});
  try {
    const response=await fetch(url,{signal:AbortSignal.timeout(12000)});
    if (!response.ok) throw new Error('HTTP '+response.status);
    const body=await response.json();
    if (body?.error) throw new Error(body.error.message||'ArcGIS source error');
    if (!Number.isSafeInteger(body.count)||body.count<0) throw new Error('Unexpected count response');
    receipt.datasets[kind]={state:'verified_count',count:body.count,source:url.split('/query?')[0]};
  } catch(error) {
    receipt.datasets[kind]={state:'source_unreachable',reason:String(error?.message??error),source:url.split('/query?')[0]};
  }
}
receipt.status=Object.values(receipt.datasets).every(v=>v.state==='verified_count')?'source_counts_verified':'source_probe_incomplete';
await writeFile(output,JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt,null,2));
if (receipt.status!=='source_counts_verified') process.exitCode=1;
