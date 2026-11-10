// Offline review only. Parses a user-supplied field attestation and never contacts a service.
import fs from 'node:fs';
import {assessCommunityRadioFieldTrial} from '../systemia/network/community-radio-field-evidence.mjs';
const file=process.argv[2];
if(!file || process.argv.length!==3){
  console.error('Usage: node scripts/community-radio-review-field-receipt.mjs /path/to/operator-attestation.json');
  process.exitCode=2;
}else{
  try{
    const stat=fs.lstatSync(file);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size>64*1024)throw Error('invalid_attestation_file');
    const report=assessCommunityRadioFieldTrial(JSON.parse(fs.readFileSync(file,'utf8')));
    process.stdout.write(JSON.stringify(report,null,2)+'\n');
    if(report.reported_stage!=='operator_attested_pending_independent_witness_review')process.exitCode=1;
  }catch(error){
    console.error('Unable to review field attestation: '+String(error.message||error));
    process.exitCode=2;
  }
}
