import fs from 'node:fs';
import path from 'node:path';
import {
  buildGoldenBridgeBenchmark,
  type GoldenBridgeBenchmarkAssets,
} from './golden-bridge-benchmark.js';

const [inputPath,outputPath]=process.argv.slice(2);
if(!inputPath||!outputPath){
  console.error('Usage: golden-bridge-benchmark-cli.ts <assets.json> <benchmark.json>');
  process.exitCode=1;
}else{
  try{
    const assets=JSON.parse(fs.readFileSync(path.resolve(inputPath),'utf8')) as GoldenBridgeBenchmarkAssets;
    const bundle=buildGoldenBridgeBenchmark(assets);
    const output=path.resolve(outputPath);
    fs.mkdirSync(path.dirname(output),{recursive:true});
    fs.writeFileSync(output,JSON.stringify(bundle,null,2)+'\n','utf8');
    console.log('Golden Bridge benchmark compiled: '+output);
    console.log('Bundle digest: '+bundle.bundleDigest);
  }catch(error){
    console.error(error instanceof Error?error.message:String(error));
    process.exitCode=1;
  }
}
