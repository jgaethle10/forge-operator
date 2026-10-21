#!/usr/bin/env node
/** Strict local UPnP web-mapping receipt verifier. Not public ingress proof. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export function verifyFabricWebRouterReceipt(receipt,host){
  if(!/^(\d{1,3}\.){3}\d{1,3}$/.test(String(host||''))){
    return {ok:false,reason:'expected_chromeos_wifi_ip_required'};
  }
  if(!receipt||typeof receipt!=='object'||receipt.ok!==true ||
     receipt.scope!=='web'||receipt.host!==host||
     receipt.web_mapping_control_ok!==true ||
     receipt.public_ingress_verified!==false){
    return {ok:false,reason:'scoped_router_receipt_invalid'};
  }
  const upnp=receipt.attempts?.find(x=>x.method==='UPnP-IGD'&&x.success===true);
  if(!upnp) return {ok:false,reason:'owner_verified_upnp_receipt_missing'};
  for(const [external,internal,desc] of [
    [80,18080,'Evercraft Fabric HTTP'],
    [443,8443,'Evercraft Fabric HTTPS']
  ]){
    const matches=(upnp.mappings||[]).filter(row=>
      row.requested?.external===external && row.requested?.proto==='TCP');
    const row=matches[0];
    if(matches.length!==1 || row?.requested?.scope!=='web' ||
       row?.requested?.internal!==internal || row?.requested?.desc!==desc ||
       row?.success!==true || row.readback_verified!==true ||
       row.observed_host!==host || row.observed_port!==internal){
      return {ok:false,reason:'upnp_owned_web_readback_mismatch',external};
    }
  }
  return {
    ok:true,
    state:'local_router_web_mapping_verified',
    host,verified_ports:[80,443],
    public_ingress_verified:false,
    verification_source:'upnp_readback_only',
  };
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  const argv=process.argv.slice(2), fileIndex=argv.indexOf('--file'),hostIndex=argv.indexOf('--host');
  const file=fileIndex>=0?argv[fileIndex+1]:null;
  const host=hostIndex>=0?argv[hostIndex+1]:null;
  try{
    if(!file||!host) throw new Error('usage: --file latest.json --host wifi-ip');
    const receipt=JSON.parse(fs.readFileSync(file,'utf8'));
    const result=verifyFabricWebRouterReceipt(receipt,host);
    console.log(JSON.stringify(result,null,2));
    if(result.ok!==true) process.exitCode=1;
  }catch(error){
    console.error(JSON.stringify({ok:false,reason:String(error.message||error)}));
    process.exitCode=1;
  }
}
