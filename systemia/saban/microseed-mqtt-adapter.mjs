import net from 'node:net';
import tls from 'node:tls';
import { randomBytes } from 'node:crypto';

const clean=v=>String(v??'').trim();

function encodeRemainingLength(value){
  let x=Math.max(0,Number(value||0));
  const bytes=[];
  do{
    let digit=x%128;
    x=Math.floor(x/128);
    if(x>0) digit|=0x80;
    bytes.push(digit);
  }while(x>0);
  if(bytes.length>4) throw new Error('mqtt_packet_too_large');
  return Buffer.from(bytes);
}
function mqttString(value,label='string'){
  const body=Buffer.from(String(value??''),'utf8');
  if(body.byteLength>65535) throw new Error('mqtt_'+label+'_too_large');
  const out=Buffer.alloc(2+body.byteLength);
  out.writeUInt16BE(body.byteLength,0);
  body.copy(out,2);
  return out;
}
function packet(firstByte,body=Buffer.alloc(0)){
  return Buffer.concat([Buffer.from([firstByte]),encodeRemainingLength(body.byteLength),body]);
}
function exactTopic(value){
  const topic=clean(value);
  const forbidden=
    topic.includes(String.fromCharCode(0)) ||
    topic.includes('\r') ||
    topic.includes('\n') ||
    topic.includes('#') ||
    topic.includes('+');
  if(!topic||topic.length>512||forbidden){
    throw new Error('mqtt_topic_invalid_or_wildcarded');
  }
  return topic;
}
function validateBroker(value){
  const url=new URL(String(value||''));
  if(!['mqtt:','mqtts:'].includes(url.protocol)) throw new Error('mqtt_broker_scheme_invalid');
  if(url.username||url.password) throw new Error('mqtt_broker_url_credentials_forbidden');
  if(url.pathname&&url.pathname!=='/') throw new Error('mqtt_broker_path_forbidden');
  return {
    url,
    host:url.hostname,
    port:Number(url.port|| (url.protocol==='mqtts:'?8883:1883)),
    tls:url.protocol==='mqtts:',
  };
}
function createReader(socket){
  let buffer=Buffer.alloc(0);
  const queue=[];
  const waiters=[];
  let terminalError=null;

  const deliver=()=>{
    while(true){
      if(buffer.length<2)return;
      let multiplier=1,remaining=0,index=1,digit;
      do{
        if(index>=buffer.length)return;
        digit=buffer[index++];
        remaining+=(digit&127)*multiplier;
        multiplier*=128;
        if(multiplier>128*128*128*128){
          terminalError=new Error('mqtt_remaining_length_invalid');
          while(waiters.length) waiters.shift().reject(terminalError);
          return;
        }
      }while((digit&128)!==0);
      const total=index+remaining;
      if(buffer.length<total)return;
      const raw=buffer.subarray(0,total);
      buffer=buffer.subarray(total);
      const parsed={
        type:raw[0]>>4,
        flags:raw[0]&0x0f,
        body:raw.subarray(index),
      };
      if(waiters.length) waiters.shift().resolve(parsed);
      else queue.push(parsed);
    }
  };
  socket.on('data',chunk=>{buffer=Buffer.concat([buffer,chunk]);deliver();});
  const fail=error=>{
    if(terminalError)return;
    terminalError=error instanceof Error?error:new Error(String(error));
    while(waiters.length) waiters.shift().reject(terminalError);
  };
  socket.on('error',fail);
  socket.on('close',()=>fail(new Error('mqtt_socket_closed')));

  return {
    next(timeoutMs){
      if(queue.length)return Promise.resolve(queue.shift());
      if(terminalError)return Promise.reject(terminalError);
      return new Promise((resolve,reject)=>{
        const waiter={resolve:null,reject:null};
        const timer=setTimeout(()=>{
          const i=waiters.indexOf(waiter);
          if(i>=0) waiters.splice(i,1);
          reject(new Error('mqtt_packet_timeout'));
        },Math.max(500,Number(timeoutMs||10000)));
        waiter.resolve=value=>{clearTimeout(timer);resolve(value);};
        waiter.reject=error=>{clearTimeout(timer);reject(error);};
        waiters.push(waiter);
      });
    },
  };
}
function connectPacket({clientId,username,password,keepalive=20}){
  if(password!=null&&username==null) throw new Error('mqtt_password_requires_username');
  let flags=0x02;
  const payload=[mqttString(clientId,'client_id')];
  if(username!=null){
    flags|=0x80;
    payload.push(mqttString(username,'username'));
  }
  if(password!=null){
    flags|=0x40;
    payload.push(mqttString(password,'password'));
  }
  const variable=Buffer.concat([
    mqttString('MQTT','protocol'),
    Buffer.from([0x04,flags]),
    Buffer.from([(keepalive>>8)&0xff,keepalive&0xff]),
  ]);
  return packet(0x10,Buffer.concat([variable,...payload]));
}
function subscribePacket(topic,packetId){
  const id=Buffer.alloc(2); id.writeUInt16BE(packetId,0);
  return packet(0x82,Buffer.concat([id,mqttString(topic,'topic'),Buffer.from([0])]));
}
function publishPacket({topic,payload,qos=1,packetId=1,retain=false}){
  const topicBuf=mqttString(topic,'topic');
  const body=qos===1
    ? Buffer.concat([topicBuf,Buffer.from([(packetId>>8)&0xff,packetId&0xff]),payload])
    : Buffer.concat([topicBuf,payload]);
  const header=0x30|(qos===1?0x02:0)|(retain?0x01:0);
  return packet(header,body);
}
function parsePublish(p){
  let offset=0;
  if(p.body.length<2) throw new Error('mqtt_publish_malformed');
  const len=p.body.readUInt16BE(offset); offset+=2;
  if(offset+len>p.body.length) throw new Error('mqtt_publish_topic_malformed');
  const topic=p.body.subarray(offset,offset+len).toString('utf8'); offset+=len;
  const qos=(p.flags>>1)&0x03;
  if(qos>0){
    if(offset+2>p.body.length) throw new Error('mqtt_publish_packet_id_missing');
    offset+=2;
  }
  return {topic,payload:p.body.subarray(offset),qos};
}
function writePacket(socket,bytes){
  return new Promise((resolve,reject)=>{
    socket.write(bytes,error=>error?reject(error):resolve());
  });
}
async function openSession({broker,credential,timeoutMs}){
  const opts={host:broker.host,port:broker.port};
  let socket;
  if(broker.tls){
    const tlsOptions={
      ...opts,
      rejectUnauthorized:true,
      ...(credential?.ca_pem?{ca:credential.ca_pem}:{}),
      ...(credential?.cert_pem?{cert:credential.cert_pem}:{}),
      ...(credential?.key_pem?{key:credential.key_pem}:{}),
      ...(net.isIP(broker.host)?{}:{servername:broker.host}),
    };
    socket=tls.connect(tlsOptions);
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('mqtt_connect_timeout')),timeoutMs);
      socket.once('secureConnect',()=>{clearTimeout(timer);resolve();});
      socket.once('error',error=>{clearTimeout(timer);reject(error);});
    });
  }else{
    socket=net.connect(opts);
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('mqtt_connect_timeout')),timeoutMs);
      socket.once('connect',()=>{clearTimeout(timer);resolve();});
      socket.once('error',error=>{clearTimeout(timer);reject(error);});
    });
  }

  const reader=createReader(socket);
  await writePacket(socket,connectPacket({
    clientId:'evercraft-'+randomBytes(8).toString('hex'),
    username:credential?.username??null,
    password:credential?.password??null,
  }));
  const connack=await reader.next(timeoutMs);
  if(connack.type!==2||connack.body.length<2) throw new Error('mqtt_connack_invalid');
  if(connack.body[1]!==0) throw new Error('mqtt_connack_rejected_'+connack.body[1]);
  return {socket,reader};
}
function operationMapping(capability,operation){
  const mapping=capability?.metadata?.mqtt?.operations?.[operation];
  if(!mapping) throw new Error('mqtt_operation_mapping_required');
  return mapping;
}
function payloadBytes(mapping,payload,idempotencyKey){
  const mode=String(mapping.payload_mode||'json');
  if(mode==='json'){
    let value=payload??null;
    if(mapping.include_idempotency_key===true){
      if(!value||typeof value!=='object'||Array.isArray(value)){
        throw new Error('mqtt_idempotency_payload_object_required');
      }
      value={...value,_evercraft_idempotency_key:String(idempotencyKey||'')};
    }
    const body=Buffer.from(JSON.stringify(value),'utf8');
    if(body.byteLength>32*1024) throw new Error('mqtt_publish_payload_too_large');
    return body;
  }
  if(mode==='text'){
    const body=Buffer.from(String(payload?.value??payload??''),'utf8');
    if(body.byteLength>32*1024) throw new Error('mqtt_publish_payload_too_large');
    return body;
  }
  throw new Error('mqtt_payload_mode_invalid');
}

export function createMicroSeedMqttAdapter({
  credentialResolver=async()=>null,
  timeoutMs=10000,
}={}){
  if(typeof credentialResolver!=='function'){
    throw new Error('microseed_mqtt_credential_resolver_required');
  }

  return {
    async invokeCapability({
      manifest,
      capability,
      operation,
      payload,
      idempotency_key,
      approval_ref,
    }={}){
      if(manifest?.bridge_mode!=='mqtt') throw new Error('microseed_mqtt_manifest_required');
      const mapping=operationMapping(capability,operation);
      const broker=validateBroker(capability.endpoint||manifest.endpoint);
      const topic=exactTopic(mapping.topic);
      const type=String(mapping.type||'subscribe_once');
      if(type==='publish'&&capability.kind==='actuation'&&!clean(approval_ref)){
        throw new Error('microseed_mqtt_actuation_approval_required');
      }
      const credential=await credentialResolver({
        device_id:manifest.device_id,
        manifest,
        capability,
        operation,
      })||null;

      let session;
      try{
        session=await openSession({
          broker,
          credential,
          timeoutMs:Math.max(1000,Number(timeoutMs||10000)),
        });

        if(type==='subscribe_once'){
          const packetId=1;
          await writePacket(session.socket,subscribePacket(topic,packetId));
          const suback=await session.reader.next(timeoutMs);
          if(suback.type!==9||suback.body.length<3||suback.body.readUInt16BE(0)!==packetId){
            throw new Error('mqtt_suback_invalid');
          }
          if(suback.body[2]===0x80) throw new Error('mqtt_subscription_rejected');
          while(true){
            const p=await session.reader.next(timeoutMs);
            if(p.type!==3) continue;
            const msg=parsePublish(p);
            if(msg.topic!==topic) continue;
            if(msg.payload.byteLength>64*1024) throw new Error('mqtt_observation_payload_too_large');
            return {
              ok:true,
              schema:'evercraft.microseed.mqtt-result.v1',
              operation,
              type:'subscribe_once',
              topic,
              qos:msg.qos,
              payload_text:msg.payload.toString('utf8'),
              credential_exposed:false,
              approval_value_exposed:false,
              wildcard_subscription:false,
            };
          }
        }

        if(type==='publish'){
          const qos=Number(mapping.qos??1);
          if(![0,1].includes(qos)) throw new Error('mqtt_publish_qos_invalid');
          const retain=mapping.retain===true;
          const body=payloadBytes(mapping,payload,idempotency_key);
          const packetId=1;
          let crossedSendBoundary=false;
          try{
            await writePacket(session.socket,publishPacket({
              topic,payload:body,qos,packetId,retain
            }));
            crossedSendBoundary=true;
            if(qos===1){
              const ack=await session.reader.next(timeoutMs);
              if(ack.type!==4||ack.body.length<2||ack.body.readUInt16BE(0)!==packetId){
                const e=new Error('mqtt_puback_invalid');
                e.outcome_unknown=true;
                throw e;
              }
            }
          }catch(error){
            if(crossedSendBoundary&&error?.outcome_unknown!==true){
              error.outcome_unknown=true;
            }
            throw error;
          }

          return {
            ok:true,
            schema:'evercraft.microseed.mqtt-result.v1',
            operation,
            type:'publish',
            topic,
            qos,
            retain,
            byte_count:body.byteLength,
            delivery_acknowledged:qos===1,
            idempotency_key_in_payload:mapping.include_idempotency_key===true,
            credential_exposed:false,
            approval_value_exposed:false,
            wildcard_topic:false,
          };
        }

        throw new Error('mqtt_operation_type_invalid');
      }finally{
        try{session?.socket?.end(Buffer.from([0xe0,0x00]));}catch{}
        try{session?.socket?.destroy();}catch{}
      }
    },
  };
}
