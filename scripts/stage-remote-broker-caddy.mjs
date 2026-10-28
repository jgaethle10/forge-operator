#!/usr/bin/env node
/**
 * Stage a candidate Caddyfile for the existing owned Fabric origin.
 * Does not activate/reload/restart Caddy or expose any route.
 *
 * Require a recognizable Fabric site; fail closed on unknown configuration.
 * Never copy the original Caddyfile into GitHub or logs.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const SITE='{\$EVERCRAFT_PUBLIC_HOST} {';
const MARKER='# Evercraft remote agent ingress v1 (staged, allowlisted)';
const ROUTES=[
  '/v1/remote/enrollment/challenge',
  '/v1/remote/enrollment/request',
  '/v1/remote/challenge',
  '/v1/remote/register',
  '/v1/remote/agent/poll',
  '/v1/remote/agent/result',
];
export function stageBrokerCaddyText(original){
  if(typeof original!=='string')throw Error('caddy_source_missing');
  if(original.includes(MARKER)||original.includes('127.0.0.1:8797')){
    throw Error('caddy_candidate_already_contains_broker');
  }
  const lines=original.split('\n');
  const starts=lines.map((line,i)=>line.trim()===SITE?i:-1).filter(i=>i>=0);
  if(starts.length!==1)throw Error('public_fabric_host_block_not_unique');
  if(!original.includes('reverse_proxy 127.0.0.1:8787')) {
    throw Error('existing_fabric_proxy_missing');
  }
  if(original.includes('/v1/remote/'))throw Error('remote_path_already_configured');
  // Existing default "handle" blocks remain intact. The broker block uses
  // a more specific path matcher and forwards only named GET/POST routes.
  const newLines=[
    '  '+MARKER,
    '  @evercraftRemoteHealth {',
    '    method GET',
    '    path /v1/remote/health',
    '  }',
    '  @evercraftRemoteSession {',
    '    method POST',
    '    path '+ROUTES.join(' '),
    '  }',
    '  handle /v1/remote/* {',
    '    route {',
    '      reverse_proxy @evercraftRemoteHealth 127.0.0.1:8797',
    '      reverse_proxy @evercraftRemoteSession 127.0.0.1:8797',
    '      respond "Not Found" 404',
    '    }',
    '  }',
    '',
  ];
  const insertion=starts[0]+1;
  lines.splice(insertion,0,...newLines);
  const staged=lines.join('\n');
  if(!staged.includes('handle /v1/remote/*') ||
      staged.includes('handle /nodes/*') ||
      staged.includes('reverse_proxy 0.0.0.0:8797'))throw Error('unsafe_route_candidate');
  return {
    staged,
    summary:{
      schema:'evercraft.remote-broker.caddy-candidate.v1',
      staged_only:true,
      existing_fabric_proxy_preserved:true,
      original_site_block_preserved:true,
      remote_health_allowed:'GET /v1/remote/health',
      agent_post_routes:ROUTES,
      broker_target:'127.0.0.1:8797',
      public_nodes_route_created:false,
      caddy_validated:false,
      public_ingress_activated:false,
      production_device_authorized:false,
      fabric_restart_performed:false,
    },
  };
}
const direct=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){
  const src='/etc/evercraft/Caddyfile';
  const out='/tmp/evercraft-remote-broker-caddy-candidate';
  if(process.argv.length!==2){console.error('usage: node stage-remote-broker-caddy.mjs');process.exit(2)}
  try{
    const original=fs.readFileSync(src,'utf8');
    const candidate=stageBrokerCaddyText(original);
    if(fs.existsSync(out))throw Error('candidate_file_already_exists_refusing_overwrite');
    fs.writeFileSync(out,candidate.staged,{mode:0o600,flag:'wx'});
    console.log(JSON.stringify({...candidate.summary,candidate_path:out},null,2));
  }catch(e){
    console.error(JSON.stringify({ok:false,state:'hold',reason:String(e?.message||e).slice(0,100)}));
    process.exitCode=2;
  }
}
