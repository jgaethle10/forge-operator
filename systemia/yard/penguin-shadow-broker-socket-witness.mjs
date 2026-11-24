/**
 * Read-only OS socket witness for a future zero-authority shadow broker.
 *
 * Only proves that the broker's TCP listening socket is bound to IPv4
 * loopback and is owned by the verified NodeSeed systemd MainPID. It does
 * NOT prove that Caddy, tunnels, proxies, or router forwarding cannot expose
 * that loopback service. Never elevates public-route absence to true.
 */
import {execFileSync} from 'node:child_process';

const NODE_UNIT='evercraft-nodeseed.service';
const NODE_PORT=42420, DNS_PORT=1053;

function validPort(n){
  return Number.isSafeInteger(n)&&n>0&&n<=65535;
}
function localSocket(line){
  const fields=String(line).trim().split(/\s+/);
  if(fields[0]!=='LISTEN'||fields.length<5)return null;
  const value=fields[3];
  const match=value.match(/^(.*):(\d{1,5})$/);
  if(!match)return null;
  const port=Number(match[2]);
  return validPort(port)?{
    address:match[1],port,raw:line,
  }:null;
}

/**
 * ss -H -ltnp lines include process metadata, e.g.
 * users:(("node",pid=123,fd=14)). Never print process arguments.
 */
export function evaluateShadowBrokerSocketBinding({
  ssOutput,pid,brokerPort,
}={}){
  const hold=[];
  const matches=[];
  const owned=[];
  if(!Number.isSafeInteger(pid)||pid<1)
    hold.push('nodeseed_main_pid_unverified');
  if(!validPort(brokerPort)||brokerPort===NODE_PORT||
     brokerPort===DNS_PORT)
    hold.push('broker_port_not_disposable');
  if(typeof ssOutput!=='string'||ssOutput.length>2*1024*1024)
    hold.push('socket_inventory_unavailable');
  if(hold.length===0){
    const pidRe=new RegExp('(?:^|[^0-9])pid='+pid+'(?:,|\\))');
    for(const line of ssOutput.split(/\r?\n/)){
      const socket=localSocket(line);
      if(!socket||socket.port!==brokerPort)continue;
      matches.push(socket);
      if(pidRe.test(line))owned.push(socket);
    }
    if(matches.length!==1||owned.length!==1)
      hold.push('broker_socket_pid_owner_not_unique');
    if(matches.length===1 && matches[0].address!=='127.0.0.1')
      hold.push('broker_listener_not_ipv4_loopback');
  }
  return {
    schema:'evercraft.penguin.shadow-broker-loopback-bind.v1',
    verified:hold.length===0,
    hold_reasons:hold,
    socket_owner_is_live_nodeseed:hold.length===0,
    loopback_only_verified:hold.length===0,
    candidate_port:validPort(brokerPort)?brokerPort:null,
    public_route_absence_proven:false,
    historical_grants_absence_proven:false,
    process_arguments_printed:false,
    socket_listing_printed:false,
    broker_activation_authorized:false,
    services_changed:false,
  };
}

/** Only called by the internal, explicitly read-only during-phase observer. */
export function observeShadowBrokerSocketBinding({brokerPort}={}){
  if(process.getuid?.()!==0)throw Error('root_required_for_socket_pid_audit');
  if(!validPort(brokerPort)||brokerPort===NODE_PORT||
     brokerPort===DNS_PORT)
    throw Error('broker_port_not_disposable');
  const raw=execFileSync('systemctl',[
    'show',NODE_UNIT,'-p','MainPID','--value',
  ],{encoding:'utf8',timeout:5000,stdio:['ignore','pipe','ignore']}).trim();
  const pid=Number(raw);
  if(!Number.isSafeInteger(pid)||pid<=0)
    throw Error('nodeseed_main_pid_unverified');
  const ssOutput=execFileSync('ss',['-H','-ltnp'],{
    encoding:'utf8',timeout:5000,maxBuffer:2*1024*1024,
    stdio:['ignore','pipe','ignore'],
  });
  return evaluateShadowBrokerSocketBinding({ssOutput,pid,brokerPort});
}
