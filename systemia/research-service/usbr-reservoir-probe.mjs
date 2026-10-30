#!/usr/bin/env node
// Diagnostic source-only USBR probe. Never triggers publication, forecasts, or dam operations.
import { collectRiseYakimaReservoirs, YAKIMA_RESERVOIR_SITES } from './usbr-rise-reservoirs.mjs';
const args=process.argv.slice(2);
if(args.length!==1 || args[0]!=='--probe'){
  process.stderr.write('Usage: node systemia/research-service/usbr-reservoir-probe.mjs --probe\n');
  process.exitCode=2;
}else{
  try{
    const snapshot=await collectRiseYakimaReservoirs({
      asOf:new Date().toISOString(),
      fetchImpl:(url,opts)=>fetch(url,{...opts,signal:AbortSignal.timeout(15000)}),
      codes:YAKIMA_RESERVOIR_SITES.map(x=>x.code)
    });
    process.stdout.write(JSON.stringify(snapshot,null,2)+'\n');
    if(snapshot.current_station_count!==YAKIMA_RESERVOIR_SITES.length || snapshot.failures.length)process.exitCode=1;
  }catch(error){
    process.stderr.write('RISE diagnostic failed: '+String(error?.message||error).slice(0,160)+'\n');
    process.exitCode=1;
  }
}
