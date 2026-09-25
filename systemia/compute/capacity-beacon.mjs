import dgram from 'node:dgram';

export function encodeCapacityBeacon({
  nodeId,
  endpoint,
  expiresAt = new Date(Date.now() + 15_000).toISOString(),
} = {}) {
  if (!nodeId) throw new Error('nodeId is required');
  const url = new URL(String(endpoint || ''));
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('endpoint must use http or https');
  if (url.username || url.password) throw new Error('endpoint must not contain credentials');
  if (url.search || url.hash) throw new Error('endpoint must not contain query or fragment');

  return Buffer.from(JSON.stringify({
    schema: 'evercraft.capacity.beacon.v1',
    node_id: String(nodeId),
    endpoint: url.toString().replace(/\/$/, ''),
    expires_at: String(expiresAt),
    carries_credentials: false,
  }));
}

export function parseCapacityBeacon(input) {
  const raw = Buffer.isBuffer(input) ? input.toString('utf8') : String(input || '');
  const value = JSON.parse(raw);
  if (value.schema !== 'evercraft.capacity.beacon.v1') throw new Error('invalid beacon schema');
  if (value.carries_credentials !== false) throw new Error('beacon must not carry credentials');
  const endpoint = new URL(String(value.endpoint || ''));
  if (!['http:', 'https:'].includes(endpoint.protocol)) throw new Error('invalid beacon endpoint');
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error('unsafe beacon endpoint');
  }
  const expires = Date.parse(String(value.expires_at || ''));
  if (!Number.isFinite(expires)) throw new Error('invalid beacon expiry');
  return {
    schema: value.schema,
    node_id: String(value.node_id || ''),
    endpoint: endpoint.toString().replace(/\/$/, ''),
    expires_at: new Date(expires).toISOString(),
    carries_credentials: false,
  };
}

export async function startCapacityBeacon({
  nodeId,
  endpoint,
  address = '239.42.24.42',
  port = 42424,
  intervalMs = 5_000,
} = {}) {
  const socket = dgram.createSocket('udp4');
  const sendNow = () => new Promise((resolve, reject) => {
    const payload = encodeCapacityBeacon({ nodeId, endpoint });
    socket.send(payload, port, address, (error) => error ? reject(error) : resolve());
  });

  const timer = setInterval(() => sendNow().catch(() => {}), Math.max(100, intervalMs));
  timer.unref?.();
  await sendNow();

  return {
    schema: 'evercraft.capacity.beacon-service.v1',
    address,
    port,
    sendNow,
    close: async () => {
      clearInterval(timer);
      await new Promise((resolve) => socket.close(resolve));
    },
  };
}

export async function discoverCapacityBeacons({
  bindAddress = '0.0.0.0',
  multicastAddress = '239.42.24.42',
  port = 42424,
  timeoutMs = 1_000,
  joinMulticast = true,
} = {}) {
  const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  const found = new Map();

  socket.on('message', (message) => {
    try {
      const beacon = parseCapacityBeacon(message);
      if (Date.parse(beacon.expires_at) >= Date.now()) {
        found.set(beacon.endpoint, beacon);
      }
    } catch {}
  });

  await new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.bind(port, bindAddress, () => {
      try {
        if (joinMulticast) socket.addMembership(multicastAddress);
      } catch {}
      resolve();
    });
  });

  await new Promise((resolve) => setTimeout(resolve, Math.max(50, timeoutMs)));
  await new Promise((resolve) => socket.close(resolve));
  return [...found.values()];
}
