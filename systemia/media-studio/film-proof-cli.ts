import fs from 'node:fs';
import path from 'node:path';
import {
  materializeFilmProofBundle,
  verifyFilmProofBundle,
  type FilmProofBundleInput,
} from './film-proof-bundle.js';

const [command,a,b]=process.argv.slice(2);
try{
  if(command==='pack'&&a&&b){
    const bundle=JSON.parse(fs.readFileSync(path.resolve(a),'utf8')) as FilmProofBundleInput;
    const receipt=materializeFilmProofBundle({bundle,outputDir:b});
    console.log('Film proof bundle: '+receipt.bundleDir);
    console.log('Manifest SHA-256: '+receipt.manifestSha256);
  }else if(command==='verify'&&a){
    const result=verifyFilmProofBundle(a);
    console.log(JSON.stringify(result,null,2));
    if(result.status!=='accepted') process.exitCode=2;
  }else{
    console.error('Usage: film-proof-cli.ts pack <bundle-input.json> <output-dir> | verify <bundle-dir>');
    process.exitCode=1;
  }
}catch(error){
  console.error(error instanceof Error?error.message:String(error));
  process.exitCode=1;
}
