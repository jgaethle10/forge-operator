#!/usr/bin/env node
import dgram from 'node:dgram';
import process from 'node:process';

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
if (!gateway || !host) {
  console.error('Required: --gateway <router-ip> --host <chromebook-lan-ip>');
  process.exit(2);
}

const mappings = [
  { external: 80, internal: 18080, proto: 'TCP', desc: 'Evercraft Fabric HTTP' },
  { external: 443, internal: 8443, proto: 'TCP', desc: 'Evercraft Fabric HTTPS' },
];

const out = {
  ok: false,
  gateway,
  host,
  attempts: [],
  mappings,
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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

function extractService(xml) {
  const blocks = xml.match(/<service>[\s\S]*?<\/service>/gi) || [];
  const preferred = [
    'urn:schemas-upnp-org:service:WANIPConnection:2',
    'urn:schemas-upnp-org:service:WANIPConnection:1',
    'urn:schemas-upnp-org:service:WANPPPConnection:1',
  ];
  for (const type of preferred) {
    const block = blocks.find(b => b.includes(type));
    if (!block) continue;
    const control = block.match(/<controlURL>([^<]+)<\/controlURL>/i)?.[1]?.trim();
    if (control) return { serviceType: type, controlURL: control };
  }
  return null;
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
  const result = { method: 'UPnP-IGD', success: false, locations: [], external_ip: null, mappings: [] };
  const locations = await discoverUpnp();
  result.locations = locations;

  for (const location of locations) {
    try {
      const xml = await (await fetch(location, { signal: AbortSignal.timeout(3000) })).text();
      const service = extractService(xml);
      if (!service) continue;
      const control = new URL(service.controlURL, location).href;

      try {
        const ipXml = await soap(control, service.serviceType, 'GetExternalIPAddress', '');
        result.external_ip = ipXml.match(/<NewExternalIPAddress>([^<]+)<\/NewExternalIPAddress>/i)?.[1] || null;
      } catch {}

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
      result.success = mapped.length === mappings.length && mapped.every(x => x.success);
      if (result.success) {
        result.location = location;
        result.control = control;
        result.service_type = service.serviceType;
        return result;
      }
    } catch {}
  }
  return result;
}

async function main() {
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
  }

  console.log(JSON.stringify(out, null, 2));
  process.exit(out.ok ? 0 : 1);
}

await main();
