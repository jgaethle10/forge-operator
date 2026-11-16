#!/usr/bin/env node
// Official NRCS historical SWE median canary; NO publication or basin percentage.
import {readFileSync} from 'node:fs';
import {collectSweMedianAudit} from './awdb-swe-normals.mjs';

const args=process.argv.slice(2);
if(args.length!==2 || args[0]!=='--snapshot'){
  process.stderr.write('Usage: node systemia/research-service/awdb-swe-median-probe.mjs --snapshot path/to/latest.json\n');
  process.exitCode=2;
}else{
  try {
    const snapshot=JSON.parse(readFileSync(args[1],'utf8'));
    const result=await collectSweMedianAudit(snapshot,{
      fetchImpl:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(16000)})
    });
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
    if(result.failures.length)process.exitCode=1;
  }catch(error){
    process.stderr.write('NRCS SWE median audit failure: '+String(error?.message||error).slice(0,160)+'\n');
    process.exitCode=1;
  }
}
