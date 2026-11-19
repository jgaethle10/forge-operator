#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {start} from '../../infra/evercraft-edge/dns/runtime.mjs';
import {buildLoopbackLabZone,enforceLabBind,planAlias,verifyRegistry} from './namespace.mjs';

const registry=JSON.parse(fs.readFileSync(new URL('./registry.json',import.meta.url),'utf8'));
const mode=process.argv[2]||'plan';
const arg=(name,fallback)=>{const n=process.argv.indexOf(name);return n>=0?process.argv[n+1]:fallback;};
const alias=arg('--alias','onthegoquicklube.evercraft');
verifyRegistry(registry);
if(mode==='plan'){
 console.log(JSON.stringify(planAlias(registry,alias),null,2));
}else if(mode==='lab-zone'){
 console.log(JSON.stringify(buildLoopbackLabZone(registry,alias),null,2));
}else if(mode==='serve-lab'){
 const host='127.0.0.1',port=Number(arg('--port','15353'));
 enforceLabBind(host,port);
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-domains-loopback-'));
 const file=path.join(temp,'zone.json');
 fs.writeFileSync(file,JSON.stringify(buildLoopbackLabZone(registry,alias)),{mode:0o600});
 const server=start({snapshotPath:file,host,port});
 const shutdown=()=>{
  try{server.udp.close();server.tcp.close();}finally{
   try{fs.rmSync(temp,{recursive:true,force:true});}catch{}
  }
 };
 process.once('SIGINT',()=>{shutdown();process.exit(0);});
 process.once('SIGTERM',()=>{shutdown();process.exit(0);});
 console.log(JSON.stringify({state:'private_dns_loopback_lab_only',
  host,port,alias,website_live:false,public_tld:false,
  public_dns_changed:false,client_site_deployed:false,
  test_command:'dig @127.0.0.1 -p '+port+' '+alias+' A'}));
}else{
 throw new Error('usage: cli.mjs [plan|lab-zone|serve-lab] [--alias onthegoquicklube.evercraft] [--port 15353]');
}
