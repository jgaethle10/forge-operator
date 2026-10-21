import fs from 'node:fs';
import path from 'node:path';
import {
  buildCanonReferencePack,
  type CanonReferencePackInput,
} from './canon-reference-pack.js';

const [inputPath,outputPath]=process.argv.slice(2);
if(!inputPath||!outputPath){
  console.error('Usage: canon-reference-pack-cli.ts <input.json> <pack.json>');
  process.exitCode=1;
}else{
  try{
    const input=JSON.parse(fs.readFileSync(path.resolve(inputPath),'utf8')) as CanonReferencePackInput;
    const pack=buildCanonReferencePack(input);
    const output=path.resolve(outputPath);
    fs.mkdirSync(path.dirname(output),{recursive:true});
    fs.writeFileSync(output,JSON.stringify(pack,null,2)+'\n','utf8');
    console.log('Canon reference pack: '+output);
    console.log('Canon digest: '+pack.canonDigest);
    console.log('Materialization digest: '+pack.materializationDigest);
  }catch(error){
    console.error(error instanceof Error?error.message:String(error));
    process.exitCode=1;
  }
}
