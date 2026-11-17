#!/usr/bin/env node
/**
 * Read-only live NodeSeed resident inventory.
 * Looks at only the systemd MainPID's TCP listeners, then probes a fixed
 * read-only broker and Edge DNS health routes on loopback. Does not inspect processes'
 * argv/env output, private grant state, broker control tokens, or enrollments.
 */
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const RECEIPT='/var/lib/evercraft/nodeseed/nodeseed-receipt.json';
const UNIT='evercraft-nodeseed.service';
const DNS_PORT=1053;

export function parseOwnedTcpPorts(output,pid){
  if(!Number.isInteger(pid)||pid<=0)throw Error('nodeseed_pid_invalid');
  const seen=new Set();
  for(const line of String(output).split(/\r?\n/)){
    if(!new RegExp('(?:^|[^0-9])pid='+pid+'(?:,|\\))').test(line))continue;
    const parts=line.trim().split(/\s+/);
    const local=parts[3]||'';
    const m=local.match(/:(\d{1,5})$/);
    if(!m)continue;
    const port=Number(m[1]);
    if(port>0&&port<=65535)seen.add(port);
  }
  return [...seen].sort((a,b)=>a-b);
}

export function classifyBrokerHealth(health){
  if(health?.ok!==true||
     health?.schema!=='evercraft.remote-capacity.broker-health.v1'||
     health?.service!=='remote-capacity-broker'||
     health?.runtime!=='Evercraft Compute'||
     health?.secure_envelope_schema!=='evercraft.secure-envelope.v1'){
    return null;
  }
  return {
    broker_detected:true,
    deployment_receipt_bound:health.deployment_receipt_bound===true,
    authorized_device_count:Number.isInteger(health.authorized_devices)?
      health.authorized_devices:null,
    registered_node_count:Number.isInteger(health.registered_nodes)?
      health.registered_nodes:null,
    pending_enrollment_count:Number.isInteger(health.pending_enrollment_requests)?
      health.pending_enrollment_requests:null,
    broker_instance_id_printed:false,
    secrets_printed:false,
  };
}

export function classifyEdgeDnsHealth(health,ownerPorts,httpPort){
  // The verified Evercraft Edge DNS runtime binds DNS TCP on port 1053
  // and starts an independent HTTP /health endpoint on a dynamic port.
  // Require BOTH sockets to belong to NodeSeed's MainPID.
  const dnsPort=Number(health?.dns_bind_port);
  if(health?.ok!==true||
     health.service!=='evercraft-edge-dns'||
     health.runtime!=='Evercraft Compute'||
     health.workload_class!=='systemia.evercraft-edge-dns.v1'||
     health.authoritative!==true||
     health.recursive!==false||
     health.dns_tcp!==true||
     health.dns_udp!==true||
     !/^edge_dns_[a-f0-9]{16}$/i.test(String(health.instance_id||''))||
     dnsPort!==DNS_PORT||
     !Array.isArray(ownerPorts)||
     !ownerPorts.includes(dnsPort)||
     !ownerPorts.includes(httpPort)||
     httpPort===dnsPort){
    return null;
  }
  return {
    service:'evercraft-edge-dns',
    workload_class:'systemia.evercraft-edge-dns.v1',
    dns_tcp_port:dnsPort,
    health_http_port:httpPort,
    authoritative:true,
    recursive:false,
    udp_confirmed_by_socket_audit:false,
    instance_id_printed:false,
    snapshot_contents_printed:false,
    secrets_printed:false,
  };
}

function readReceipt(){
  const stat=fs.lstatSync(RECEIPT);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>64*1024)
    throw Error('nodeseed_receipt_file_invalid');
  return JSON.parse(fs.readFileSync(RECEIPT,'utf8'));
}

function unitField(name){
  return execFileSync('systemctl',[
    'show',UNIT,'-p',name,'--value',
  ],{
    encoding:'utf8',timeout:5_000,stdio:['ignore','pipe','ignore'],
  }).trim();
}

async function getJson(origin,endpoint){
  const res=await fetch(origin+endpoint,{
    method:'GET',headers:{accept:'application/json'},
    signal:AbortSignal.timeout(3_000),
  });
  if(!res.ok)return null;
  const raw=await res.text();
  if(raw.length>8192)return null;
  try{return JSON.parse(raw)}catch{return null}
}

export async function inspectLiveResidents(){
  if(typeof process.getuid!=='function'||process.getuid()!==0)
    throw Error('root_required_for_process_socket_inventory');
  const pid=Number(unitField('MainPID'));
  if(!Number.isInteger(pid)||pid<=0||!fs.existsSync('/proc/'+pid))
    throw Error('nodeseed_process_absent');
  const receipt=readReceipt();
  const originUrl=new URL(String(receipt.endpoint||''));
  const nodePort=Number(originUrl.port);
  if(originUrl.protocol!=='http:'||
     !Number.isInteger(nodePort)||nodePort<1||nodePort>65535)
    throw Error('invalid_nodeseed_receipt_endpoint');
  const origin='http://127.0.0.1:'+nodePort;
  const [health,capacity]=await Promise.all([
    getJson(origin,'/v1/health'),
    getJson(origin,'/v1/capacity'),
  ]);
  if(health?.ok!==true||
     health.node_id!==receipt.node_id||
     capacity?.protocol!=='evercraft.capacity.v1'||
     capacity.node_id!==receipt.node_id||
     capacity.device_fingerprint!==receipt.device_fingerprint)
    throw Error('node_identity_or_live_health_mismatch');

  let ports=null;
  let socketAuditError=null;
  try{
    const ss=execFileSync('ss',['-H','-ltnp'],{
      encoding:'utf8',timeout:5_000,
      maxBuffer:2*1024*1024,
      stdio:['ignore','pipe','ignore'],
    });
    ports=parseOwnedTcpPorts(ss,pid);
  }catch{
    socketAuditError='ss_unavailable_or_socket_visibility_incomplete';
  }

  const extra=(ports||[]).filter(p=>p!==nodePort).slice(0,32);
  const sockets=[];
  for(const port of extra){
    // 1053 is a TCP DNS listener. Do not send HTTP requests to it.
    if(port===DNS_PORT){
      sockets.push({port,broker:null,edgeDns:null});
      continue;
    }
    let broker=null;
    let edgeDns=null;
    try{
      edgeDns=classifyEdgeDnsHealth(
        await getJson('http://127.0.0.1:'+port,'/health'),ports,port
      );
    }catch{}
    if(!edgeDns){
      try{
        broker=classifyBrokerHealth(
          await getJson('http://127.0.0.1:'+port,'/v1/remote/health')
        );
      }catch{}
    }
    sockets.push({port,broker,edgeDns});
  }

  const brokers=sockets.filter(x=>x.broker);
  const dns=sockets.filter(x=>x.edgeDns).map(x=>x.edgeDns);
  const claimedPorts=new Set([
    ...brokers.map(x=>x.port),
    ...dns.map(x=>x.dns_tcp_port),
    ...dns.map(x=>x.health_http_port),
  ]);
  const unclassified=extra.filter(p=>!claimedPorts.has(p));
  const residentCount=Number.isInteger(health.resident_services)?
    health.resident_services:null;
  const accountedFor=residentCount!==null &&
    brokers.length+dns.length===residentCount &&
    unclassified.length===0;
  return {
    schema:'evercraft.penguin.live-resident-inventory.v1',
    read_only:true,
    node_health_verified:true,
    node_port:nodePort,
    resident_service_count:residentCount,
    owner_tcp_ports:ports,
    broker_listeners:brokers.map(({port,broker})=>({port,broker})),
    edge_dns_services:dns,
    unclassified_tcp_listener_ports:unclassified,
    socket_audit_error:socketAuditError,
    service_identity_resolved:accountedFor,
    private_grants_inspected:false,
    historical_authority_unchanged:true,
    process_arguments_or_environment_printed:false,
    no_service_changed:true,
    physical_canary_authorized:false,
  };
}

const direct=process.argv[1]&&
  path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){
  inspectLiveResidents().then(report=>{
    console.log(JSON.stringify(report,null,2));
    if(report.socket_audit_error||!report.service_identity_resolved)
      process.exitCode=3;
  }).catch(error=>{
    console.error(JSON.stringify({
      schema:'evercraft.penguin.live-resident-inventory-error.v1',
      reason:String(error?.message||'audit_failed').slice(0,120),
      no_service_changed:true,
      physical_canary_authorized:false,
    }));
    process.exitCode=3;
  });
}
