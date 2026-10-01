#!/usr/bin/env node
import dgram from 'node:dgram';
import net from 'node:net';
import process from 'node:process';
import { randomBytes } from 'node:crypto';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  const k = process.argv[i];
  const v = process.argv[i + 1];
  if (!k?.startsWith('--') || v === undefined) {
    console.error('Usage: node scripts/evercraft-public-edge-map.mjs --gateway 192.168.88.1 --host 192.168.88.3');
    process.exit(2);
  }
  args.set(k.slice(2), v);
}

const gateway = args.get('gateway');
const host = args.get('host');
const scope = String(args.get('scope') || 'all').toLowerCase();
if (!gateway || !host) {
  console.error('Required: --gateway <router-ip> --host <chromebook-lan-ip> [--scope all|web|dns]');
  process.exit(2);
}
if (!['all','web','dns'].includes(scope)) {
  console.error('Invalid --scope. Expected all, web, or dns.');
  process.exit(2);
}

const allMappings = [
  { external: 80, internal: 18080, proto: 'TCP', desc: 'Evercraft Fabric HTTP', scope:'web' },
  { external: 443, internal: 8443, proto: 'TCP', desc: 'Evercraft Fabric HTTPS', scope:'web' },
  { external: 53, internal: 1053, proto: 'TCP', desc: 'Evercraft Edge authoritative DNS TCP', scope:'dns' },
  { external: 53, internal: 1053, proto: 'UDP', desc: 'Evercraft Edge authoritative DNS UDP', scope:'dns' },
];
const mappings = scope === 'all'
  ? allMappings
  : allMappings.filter(m => m.scope === scope);

const out = {
  ok: false,
  gateway,
  host,
  attempts: [],
  scope,
  mappings,
  host_forward_preflight: null,
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function tcpProbe(hostname,port,timeoutMs=1500){
  return new Promise((resolve)=>{
    const socket=net.createConnection({host:hostname,port});
    let settled=false;
    const done=(ok,error='')=>{
      if(settled) return;
      settled=true;
      socket.destroy();
      resolve({port,ok,error:error?String(error):null});
    };
    socket.setTimeout(timeoutMs,()=>done(false,'timeout'));
    socket.once('connect',()=>done(true));
    socket.once('error',(error)=>done(false,error.message));
  });
}

function dnsQuery(name='edge-canary.evercraftpropertyservices.com.'){
  const labels=name.replace(/\.$/,'').split('.');
  const qname=Buffer.concat([
    ...labels.map(label=>Buffer.concat([Buffer.from([Buffer.byteLength(label)]),Buffer.from(label)])),
    Buffer.from([0])
  ]);
  const header=Buffer.alloc(12);
  header.writeUInt16BE(0x4556,0);
  header.writeUInt16BE(0x0100,2);
  header.writeUInt16BE(1,4);
  return Buffer.concat([header,qname,Buffer.from([0,16,0,1])]);
}

function udpDnsProbe(hostname,port=1053,timeoutMs=1500){
  return new Promise((resolve)=>{
    const socket=dgram.createSocket('udp4');
    let settled=false;
    const done=(ok,error='')=>{
      if(settled)return;
      settled=true;
      socket.close();
      resolve({protocol:'udp',port,ok,error:error?String(error):null});
    };
    const timer=setTimeout(()=>done(false,'timeout'),timeoutMs);
    socket.once('error',e=>{clearTimeout(timer);done(false,e.message)});
    socket.once('message',msg=>{
      clearTimeout(timer);
      const valid=msg.length>=12 && msg.readUInt16BE(0)===0x4556 && Boolean(msg.readUInt16BE(2)&0x8000);
      done(valid,valid?'':'invalid_dns_response');
    });
    socket.send(dnsQuery(),port,hostname,e=>{
      if(e){clearTimeout(timer);done(false,e.message)}
    });
  });
}

async function verifyHostForward(){
  const probes=[];
  if(scope==='all'||scope==='web'){
    probes.push(await tcpProbe(host,18080));
    probes.push(await tcpProbe(host,8443));
  }
  if(scope==='all'||scope==='dns'){
    probes.push(await tcpProbe(host,1053));
    probes.push(await udpDnsProbe(host,1053));
  }
  return {
    schema:'evercraft.chromeos-host-forward-preflight.v1',
    scope,
    host,
    probes,
    ready:probes.length>0&&probes.every(x=>x.ok===true),
    checked_at:new Date().toISOString(),
  };
}

async function natPmpMap() {
  const socket = dgram.createSocket('udp4');
  const result = { method: 'NAT-PMP', success: false, external_ip: null, mappings: [] };

  const request = (buf, timeout = 1800) => new Promise((resolve, reject) => {
    let timer;
    const onMessage = msg => {
      clearTimeout(timer);
      socket.off('message', onMessage);
      resolve(msg);
    };
    socket.on('message', onMessage);
    socket.send(buf, 5351, gateway, err => {
      if (err) {
        clearTimeout(timer);
        socket.off('message', onMessage);
        reject(err);
      }
    });
    timer = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error('timeout'));
    }, timeout);
  });

  try {
    try {
      const resp = await request(Buffer.from([0, 0]));
      if (resp.length >= 12 && resp[0] === 0 && resp[1] === 128 && resp.readUInt16BE(2) === 0) {
        result.external_ip = [...resp.subarray(8, 12)].join('.');
      }
    } catch {}

    for (const m of mappings) {
      const buf = Buffer.alloc(12);
      buf[0] = 0;
      buf[1] = m.proto === 'TCP' ? 2 : 1;
      buf.writeUInt16BE(0, 2);
      buf.writeUInt16BE(m.internal, 4);
      buf.writeUInt16BE(m.external, 6);
      buf.writeUInt32BE(86400, 8);
      try {
        const resp = await request(buf);
        if (resp.length < 16) throw new Error('short response');
        const code = resp.readUInt16BE(2);
        const internal = resp.readUInt16BE(8);
        const external = resp.readUInt16BE(10);
        const lifetime = resp.readUInt32BE(12);
        result.mappings.push({ requested: m, result_code: code, internal, external, lifetime, success: code === 0 });
      } catch (e) {
        result.mappings.push({ requested: m, success: false, error: e.message });
      }
    }
    result.success = result.mappings.length === mappings.length && result.mappings.every(x => x.success);
  } finally {
    socket.close();
  }
  return result;
}

function parseHeaders(raw) {
  const headers = {};
  for (const line of raw.split(/\r?\n/).slice(1)) {
    const idx = line.indexOf(':');
    if (idx > 0) headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
  }
  return headers;
}

async function discoverUpnp() {
  const socket = dgram.createSocket('udp4');
  const locations = new Set();
  const sts = [
    'urn:schemas-upnp-org:device:InternetGatewayDevice:1',
    'urn:schemas-upnp-org:service:WANIPConnection:1',
    'urn:schemas-upnp-org:service:WANIPConnection:2',
    'ssdp:all',
  ];

  socket.on('message', msg => {
    const h = parseHeaders(msg.toString('utf8'));
    if (h.location) locations.add(h.location);
  });

  await new Promise(resolve => socket.bind(0, '0.0.0.0', resolve));

  for (const st of sts) {
    const req = Buffer.from(
      'M-SEARCH * HTTP/1.1\r\n' +
      'HOST: 239.255.255.250:1900\r\n' +
      'MAN: "ssdp:discover"\r\n' +
      'MX: 1\r\n' +
      `ST: ${st}\r\n\r\n`
    );
    socket.send(req, 1900, '239.255.255.250');
    socket.send(req, 1900, gateway);
  }

  await sleep(2200);
  socket.close();
  return [...locations];
}

function tagValue(block, localName) {
  const re = new RegExp('<(?:[A-Za-z0-9_.-]+:)?' + localName + '\\b[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_.-]+:)?' + localName + '>', 'i');
  return block.match(re)?.[1]?.trim() || null;
}

function extractServices(xml) {
  const serviceBlockRe = new RegExp(
    '<(?:[A-Za-z0-9_.-]+:)?service\\b[^>]*>[\\s\\S]*?<\\/(?:[A-Za-z0-9_.-]+:)?service>',
    'gi',
  );
  const blocks = xml.match(serviceBlockRe) || [];
  const preferred = [
    'urn:schemas-upnp-org:service:WANIPConnection:2',
    'urn:schemas-upnp-org:service:WANIPConnection:1',
    'urn:schemas-upnp-org:service:WANPPPConnection:1',
  ];
  const found = [];
  for (const block of blocks) {
    const serviceType = tagValue(block, 'serviceType');
    const controlURL = tagValue(block, 'controlURL');
    if (!serviceType || !controlURL) continue;
    if (preferred.includes(serviceType)) found.push({ serviceType, controlURL });
  }
  return found.sort((a, b) => preferred.indexOf(a.serviceType) - preferred.indexOf(b.serviceType));
}

async function soap(control, serviceType, action, body) {
  const envelope =
    '<?xml version="1.0"?>' +
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">' +
    '<s:Body>' +
    `<u:${action} xmlns:u="${serviceType}">${body}</u:${action}>` +
    '</s:Body></s:Envelope>';
  const res = await fetch(control, {
    method: 'POST',
    headers: {
      'content-type': 'text/xml; charset="utf-8"',
      'soapaction': `"${serviceType}#${action}"`,
      'connection': 'close',
    },
    body: envelope,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 240)}`);
  return text;
}

async function upnpMap() {
  const result = {
    method: 'UPnP-IGD',
    success: false,
    locations: [],
    external_ip: null,
    mappings: [],
    diagnostics: [],
  };
  const locations = await discoverUpnp();
  result.locations = locations;

  for (const location of locations) {
    let xml;
    try {
      const res = await fetch(location, { signal: AbortSignal.timeout(4000) });
      const text = await res.text();
      result.diagnostics.push({
        location,
        descriptor_status: res.status,
        descriptor_bytes: Buffer.byteLength(text),
      });
      if (!res.ok) continue;
      xml = text;
    } catch (e) {
      result.diagnostics.push({ location, descriptor_error: e.message });
      continue;
    }

    const services = extractServices(xml);
    result.diagnostics.push({
      location,
      matching_services: services,
      advertised_service_types:
        [...xml.matchAll(new RegExp(
          '<(?:[A-Za-z0-9_.-]+:)?serviceType\\b[^>]*>([^<]+)<\\/(?:[A-Za-z0-9_.-]+:)?serviceType>',
          'gi',
        ))]
          .map(m => m[1].trim())
          .filter((v, i, a) => a.indexOf(v) === i),
    });

    for (const service of services) {
      const control = new URL(service.controlURL, location).href;
      try {
        const ipXml = await soap(control, service.serviceType, 'GetExternalIPAddress', '');
        result.external_ip =
          ipXml.match(new RegExp(
            '<(?:[A-Za-z0-9_.-]+:)?NewExternalIPAddress>([^<]+)<\\/(?:[A-Za-z0-9_.-]+:)?NewExternalIPAddress>',
            'i',
          ))?.[1] ||
          result.external_ip;
      } catch (e) {
        result.diagnostics.push({
          location,
          service_type: service.serviceType,
          control,
          external_ip_error: e.message,
        });
      }

      const mapped = [];
      for (const m of mappings) {
        const b =
          '<NewRemoteHost></NewRemoteHost>' +
          `<NewExternalPort>${m.external}</NewExternalPort>` +
          `<NewProtocol>${m.proto}</NewProtocol>` +
          `<NewInternalPort>${m.internal}</NewInternalPort>` +
          `<NewInternalClient>${host}</NewInternalClient>` +
          '<NewEnabled>1</NewEnabled>' +
          `<NewPortMappingDescription>${m.desc}</NewPortMappingDescription>` +
          '<NewLeaseDuration>0</NewLeaseDuration>';
        try {
          await soap(control, service.serviceType, 'AddPortMapping', b);
          mapped.push({ requested: m, success: true });
        } catch (e) {
          mapped.push({ requested: m, success: false, error: e.message });
        }
      }
      result.mappings = mapped;
      result.diagnostics.push({
        location,
        service_type: service.serviceType,
        control,
        mapping_results: mapped,
      });
      result.success = mapped.length === mappings.length && mapped.every(x => x.success);
      if (result.success) {
        result.location = location;
        result.control = control;
        result.service_type = service.serviceType;
        return result;
      }
    }
  }
  return result;
}


function ipv4Mapped(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) {
    throw new Error('invalid IPv4 address');
  }
  const b = Buffer.alloc(16);
  b[10] = 0xff;
  b[11] = 0xff;
  parts.forEach((n, i) => { b[12 + i] = n; });
  return b;
}

async function pcpMap() {
  const socket = dgram.createSocket('udp4');
  const result = { method: 'PCP', success: false, mappings: [] };

  const request = (buf, timeout = 1800) => new Promise((resolve, reject) => {
    let timer;
    const onMessage = msg => {
      clearTimeout(timer);
      socket.off('message', onMessage);
      resolve(msg);
    };
    socket.on('message', onMessage);
    socket.send(buf, 5351, gateway, err => {
      if (err) {
        clearTimeout(timer);
        socket.off('message', onMessage);
        reject(err);
      }
    });
    timer = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error('timeout'));
    }, timeout);
  });

  try {
    for (const m of mappings) {
      const nonce = randomBytes(12);
      const buf = Buffer.alloc(60);
      buf[0] = 2;
      buf[1] = 1;
      buf.writeUInt32BE(86400, 4);
      ipv4Mapped(host).copy(buf, 8);
      nonce.copy(buf, 24);
      buf[36] = m.proto === 'TCP' ? 6 : 17;
      buf.writeUInt16BE(m.internal, 40);
      buf.writeUInt16BE(m.external, 42);

      try {
        const resp = await request(buf);
        if (resp.length < 60) throw new Error('short response');
        if (resp[0] !== 2 || (resp[1] & 0x80) === 0 || (resp[1] & 0x7f) !== 1) {
          throw new Error('unexpected PCP response');
        }
        const code = resp[3];
        const lifetime = resp.readUInt32BE(4);
        const internal = resp.readUInt16BE(40);
        const external = resp.readUInt16BE(42);
        const addr = resp.subarray(44, 60);
        let externalIp = null;
        if (addr.subarray(0, 12).equals(Buffer.from([0,0,0,0,0,0,0,0,0,0,0xff,0xff]))) {
          externalIp = [...addr.subarray(12,16)].join('.');
        }
        result.mappings.push({
          requested: m,
          result_code: code,
          internal,
          external,
          lifetime,
          external_ip: externalIp,
          success: code === 0,
        });
      } catch (e) {
        result.mappings.push({ requested: m, success: false, error: e.message });
      }
    }
    result.success = result.mappings.length === mappings.length && result.mappings.every(x => x.success);
    const firstIp = result.mappings.find(x => x.external_ip)?.external_ip;
    if (firstIp) result.external_ip = firstIp;
  } finally {
    socket.close();
  }
  return result;
}

async function main() {
  out.host_forward_preflight=await verifyHostForward();
  if(out.host_forward_preflight.ready!==true){
    out.state='chromeos_host_forward_unreachable';
    out.error='chromeos_host_forward_unreachable';
    console.log(JSON.stringify(out,null,2));
    process.exit(3);
  }

  const upnp = await upnpMap().catch(e => ({ method: 'UPnP-IGD', success: false, error: e.message }));
  out.attempts.push(upnp);
  if (upnp.success) {
    out.ok = true;
    out.method = upnp.method;
    out.external_ip = upnp.external_ip;
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  const natpmp = await natPmpMap().catch(e => ({ method: 'NAT-PMP', success: false, error: e.message }));
  out.attempts.push(natpmp);
  if (natpmp.success) {
    out.ok = true;
    out.method = natpmp.method;
    out.external_ip = natpmp.external_ip;
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  const pcp = await pcpMap().catch(e => ({ method: 'PCP', success: false, error: e.message }));
  out.attempts.push(pcp);
  if (pcp.success) {
    out.ok = true;
    out.method = pcp.method;
    out.external_ip = pcp.external_ip;
  }

  console.log(JSON.stringify(out, null, 2));
  process.exit(out.ok ? 0 : 1);
}

await main();
