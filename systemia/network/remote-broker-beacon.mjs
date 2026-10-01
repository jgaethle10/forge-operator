import dgram from 'node:dgram';
import net from 'node:net';

function clean(value){return String(value??'').trim();}

function privateIpv4(host){
  if(net.isIP(host)!==4) return false;
  const parts=host.split('.').map(Number);
  if(parts[0]===10) return true;
  if(parts[0]===127) return true;
  if(parts[0]===169&&parts[1]===254) return true;
  if(parts[0]===172&&parts[1]>=16&&parts[1]<=31) return true;
  if(parts[0]===192&&parts[1]===168) return true;
  if(parts[0]===100&&parts[1]>=64&&parts[1]<=127) return true;
  return false;
}

export function encodeRemoteBrokerBeacon({
  gatewayNodeId,
  brokerEndpoint,
  expiresAt=new Date(Date.now()+15_000).toISOString(),
}={}){
  const nodeId=clean(gatewayNodeId);
  if(!nodeId) throw new Error('gateway_node_id_required');
  const endpoint=new URL(clean(brokerEndpoint));
  if(endpoint.protocol!=='http:'&&endpoint.protocol!=='https:'){
    throw new Error('broker_beacon_endpoint_protocol_invalid');
  }
  if(endpoint.username||endpoint.password||endpoint.search||endpoint.hash){
    throw new Error('broker_beacon_endpoint_unsafe');
  }
  if(endpoint.protocol==='http:'&&!privateIpv4(endpoint.hostname)){
    throw new Error('broker_beacon_http_endpoint_must_be_private');
  }
  const expires=Date.parse(expiresAt);
  if(!Number.isFinite(expires)) throw new Error('broker_beacon_expiry_invalid');
  return Buffer.from(JSON.stringify({
    schema:'evercraft.remote-broker.beacon.v1',
    gateway_node_id:nodeId,
    broker_endpoint:endpoint.toString().replace(/\/$/,''),
    expires_at:new Date(expires).toISOString(),
    carries_credentials:false,
    discovery_scope:'local_multicast',
  }));
}

export function parseRemoteBrokerBeacon(input){
  const raw=Buffer.isBuffer(input)?input.toString('utf8'):String(input||'');
  const value=JSON.parse(raw);
  if(value?.schema!=='evercraft.remote-broker.beacon.v1'){
    throw new Error('broker_beacon_schema_invalid');
  }
  if(value.carries_credentials!==false){
    throw new Error('broker_beacon_must_not_carry_credentials');
  }
  const endpoint=new URL(clean(value.broker_endpoint));
  if(endpoint.protocol!=='http:'&&endpoint.protocol!=='https:'){
    throw new Error('broker_beacon_endpoint_protocol_invalid');
  }
  if(endpoint.username||endpoint.password||endpoint.search||endpoint.hash){
    throw new Error('broker_beacon_endpoint_unsafe');
  }
  if(endpoint.protocol==='http:'&&!privateIpv4(endpoint.hostname)){
    throw new Error('broker_beacon_http_endpoint_must_be_private');
  }
  const expires=Date.parse(clean(value.expires_at));
  if(!Number.isFinite(expires)) throw new Error('broker_beacon_expiry_invalid');
  return {
    schema:value.schema,
    gateway_node_id:clean(value.gateway_node_id),
    broker_endpoint:endpoint.toString().replace(/\/$/,''),
    expires_at:new Date(expires).toISOString(),
    carries_credentials:false,
    discovery_scope:'local_multicast',
  };
}

export async function startRemoteBrokerBeacon({
  gatewayNodeId,
  brokerEndpoint,
  address='239.42.24.43',
  port=42425,
  intervalMs=5_000,
}={}){
  const socket=dgram.createSocket('udp4');
  const sendNow=()=>new Promise((resolve,reject)=>{
    const payload=encodeRemoteBrokerBeacon({gatewayNodeId,brokerEndpoint});
    socket.send(payload,port,address,(error)=>error?reject(error):resolve());
  });
  const timer=setInterval(()=>sendNow().catch(()=>{}),Math.max(250,Number(intervalMs||5_000)));
  timer.unref?.();
  await sendNow();
  return {
    schema:'evercraft.remote-broker.beacon-service.v1',
    gateway_node_id:String(gatewayNodeId),
    broker_endpoint:String(brokerEndpoint),
    address,
    port,
    sendNow,
    close:async()=>{
      clearInterval(timer);
      await new Promise((resolve)=>socket.close(resolve));
    },
  };
}

export async function discoverRemoteBrokerBeacons({
  bindAddress='0.0.0.0',
  multicastAddress='239.42.24.43',
  port=42425,
  timeoutMs=1_000,
  joinMulticast=true,
}={}){
  const socket=dgram.createSocket({type:'udp4',reuseAddr:true});
  const found=new Map();
  socket.on('message',(message)=>{
    try{
      const beacon=parseRemoteBrokerBeacon(message);
      if(Date.parse(beacon.expires_at)>=Date.now()){
        found.set(beacon.broker_endpoint,beacon);
      }
    }catch{}
  });
  await new Promise((resolve,reject)=>{
    socket.once('error',reject);
    socket.bind(port,bindAddress,()=>{
      try{if(joinMulticast) socket.addMembership(multicastAddress);}catch{}
      resolve();
    });
  });
  await new Promise((resolve)=>setTimeout(resolve,Math.max(50,Number(timeoutMs||1_000))));
  await new Promise((resolve)=>socket.close(resolve));
  return [...found.values()].sort((a,b)=>
    String(a.gateway_node_id).localeCompare(String(b.gateway_node_id))||
    String(a.broker_endpoint).localeCompare(String(b.broker_endpoint))
  );
}
