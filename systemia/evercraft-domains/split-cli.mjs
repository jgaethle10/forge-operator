#!/usr/bin/env node
// Evercraft Domains lab only: no system resolver / router / DNS zone mutation.
import fs from 'node:fs';
import {buildLoopbackLabZone,verifyRegistry,enforceLabBind} from './namespace.mjs';
import {startSplitResolver} from './split-resolver.mjs';

const registry=JSON.parse(fs.readFileSync(new URL('./registry.json',import.meta.url),'utf8'));
verifyRegistry(registry);
const args=process.argv.slice(2);
function option(name,otherwise){
 const i=args.indexOf(name);
 return i<0?otherwise:args[i+1];
}
const alias=option('--alias','onthegoquicklube.evercraft');
const port=Number(option('--port','15453'));
enforceLabBind('127.0.0.1',port);
const rawUpstream=option('--upstream',null);
let upstream=null;
if(rawUpstream!==null){
 const m=/^127\.0\.0\.1:([0-9]{4,5})$/.exec(rawUpstream);
 if(!m)throw Error('explicit_loopback_upstream_host_and_port_required');
 upstream={host:'127.0.0.1',port:Number(m[1])};
}
const zone=buildLoopbackLabZone(registry,alias);
const server=await startSplitResolver({zone,port,upstream});
console.log(JSON.stringify({
 schema:'evercraft.domains.split-lab.status.v1',
 state:'LOOPBACK_ONLY_TEST',
 private_suffix:'evercraft.',
 site_live:false,
 client_approval:false,
 public_tld_registered:false,
 system_resolver_modified:false,
 network_router_modified:false,
 upstream:upstream===null?'disabled':upstream,
 host:server.host,port:server.port
},null,2));
for(const event of ['SIGINT','SIGTERM']){
 process.once(event,async()=>{await server.close();process.exit(0);});
}
