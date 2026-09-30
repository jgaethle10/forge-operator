import fs from 'node:fs';
import path from 'node:path';
import {
  compileLongformPlan,
  renderLongformPlan,
  type LongformProjectInput,
} from './longform-checkpoints.js';

const [inputPath,outputDir,receiptPath]=process.argv.slice(2);
if(!inputPath||!outputDir){
  console.error('Usage: node --import tsx systemia/media-studio/longform-cli.ts <project.json> <output-dir> [receipt.json]');
  process.exitCode=1;
}else{
  try{
    const input=JSON.parse(fs.readFileSync(path.resolve(inputPath),'utf8')) as LongformProjectInput;
    const plan=compileLongformPlan(input);
    const receipt=renderLongformPlan({plan,outputDir});
    if(receiptPath){
      const target=path.resolve(receiptPath);
      fs.mkdirSync(path.dirname(target),{recursive:true});
      fs.writeFileSync(target,JSON.stringify({plan,receipt},null,2)+'\n','utf8');
    }
    console.log('Long-form master: '+receipt.outputPath);
    console.log('SHA-256: '+receipt.outputSha256);
    console.log('Acts rendered: '+receipt.renderedActCount+'; reused: '+receipt.reusedActCount);
  }catch(error){
    console.error(error instanceof Error?error.message:String(error));
    process.exitCode=1;
  }
}
