#!/usr/bin/env node
// Read-only NRCS official basin update canary; never infer flood threat or a seasonal outlook.
import {fetchNrcsWashingtonBasinReport} from './nrcs-basin-report.mjs';
const args=process.argv.slice(2);
if(args.length!==1||args[0]!=='--probe'){
  process.stderr.write('Usage: node systemia/research-service/nrcs-basin-probe.mjs --probe\n');
  process.exitCode=2;
}else{
  try {
    const source=await fetchNrcsWashingtonBasinReport({
      asOf:new Date().toISOString(),
      fetchImpl:(url,opts)=>fetch(url,{...opts,signal:AbortSignal.timeout(20000),redirect:'follow'})
    });
    process.stdout.write(JSON.stringify(source,null,2)+'\n');
  }catch(error){
    process.stderr.write('Official NRCS basin report held: '+String(error?.message||error).slice(0,160)+'\n');
    process.exitCode=1;
  }
}
