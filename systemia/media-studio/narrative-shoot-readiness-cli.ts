import fs from 'node:fs';
import path from 'node:path';
import {
  assessNarrativeShootReadiness,
  type NarrativeShootReadinessInput,
} from './narrative-shoot-readiness.js';

const [inputPath,outputPath]=process.argv.slice(2);
if(!inputPath||!outputPath){
  console.error('Usage: narrative-shoot-readiness-cli.ts <input.json> <report.json>');
  process.exitCode=1;
}else{
  try{
    const input=JSON.parse(fs.readFileSync(path.resolve(inputPath),'utf8')) as NarrativeShootReadinessInput;
    const report=assessNarrativeShootReadiness(input);
    const output=path.resolve(outputPath);
    fs.mkdirSync(path.dirname(output),{recursive:true});
    fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n','utf8');
    console.log('Narrative shoot readiness: '+report.status);
    console.log('Immediate shots: '+report.immediateShotIds.join(', '));
    console.log('Deferred shots: '+report.deferredShotIds.join(', '));
    console.log('Blocked shots: '+report.blockedShotIds.join(', '));
    if(report.status!=='ready') process.exitCode=2;
  }catch(error){
    console.error(error instanceof Error?error.message:String(error));
    process.exitCode=1;
  }
}
