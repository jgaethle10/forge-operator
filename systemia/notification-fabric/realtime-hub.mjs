import crypto from 'node:crypto';

function sseEvent(event, data, id = null) {
  const lines = [];
  if (id) lines.push(`id: ${id}`);
  if (event) lines.push(`event: ${event}`);
  for (const line of JSON.stringify(data).split('\n')) lines.push(`data: ${line}`);
  return lines.join('\n') + '\n\n';
}

export function createRealtimeHub(options = {}) {
  const principals = new Map();
  const heartbeatMs = Math.max(10000, Math.min(Number(options.heartbeatMs ?? 25000), 60000));
  const maxConnectionsPerPrincipal = Math.max(1, Math.min(Number(options.maxConnectionsPerPrincipal ?? 5), 20));

  function remove(principalId, connectionId) {
    const bucket = principals.get(principalId);
    if (!bucket) return;
    const connection = bucket.get(connectionId);
    if (connection?.heartbeat) clearInterval(connection.heartbeat);
    bucket.delete(connectionId);
    if (!bucket.size) principals.delete(principalId);
  }

  function connect({ principalId, res, metadata = {} }) {
    const principal = String(principalId || '').trim();
    if (!principal) throw new Error('Realtime principal is required.');
    let bucket = principals.get(principal);
    if (!bucket) {
      bucket = new Map();
      principals.set(principal, bucket);
    }
    while (bucket.size >= maxConnectionsPerPrincipal) {
      const oldest = bucket.keys().next().value;
      const connection = bucket.get(oldest);
      try { connection?.res?.end(); } catch {}
      remove(principal, oldest);
    }
    const id = crypto.randomUUID();
    const connectedAt = new Date().toISOString();
    const heartbeat = setInterval(() => {
      try { res.write(`: relay-heartbeat ${Date.now()}\n\n`); }
      catch { remove(principal, id); }
    }, heartbeatMs);
    heartbeat.unref?.();
    bucket.set(id, { id, res, connectedAt, heartbeat, metadata });
    res.write(sseEvent('relay.ready', { schema: 'systemia.relay.ready.v1', connection_id: id, connected_at: connectedAt }, id));
    const close = () => remove(principal, id);
    res.on?.('close', close);
    res.on?.('error', close);
    return { connection_id: id, connected_at: connectedAt, close };
  }

  function deliver(principalId, payload) {
    const principal = String(principalId || '').trim();
    const bucket = principals.get(principal);
    if (!bucket?.size) return { principal_id: principal, attempted: 0, delivered: 0 };
    let delivered = 0;
    for (const [id, connection] of [...bucket.entries()]) {
      try {
        connection.res.write(sseEvent('notification', payload, payload.id || id));
        delivered += 1;
      } catch {
        remove(principal, id);
      }
    }
    return { principal_id: principal, attempted: bucket.size, delivered };
  }

  function presence(principalId) {
    return principals.get(String(principalId || '').trim())?.size || 0;
  }

  function snapshot() {
    let connections = 0;
    for (const bucket of principals.values()) connections += bucket.size;
    return { principals: principals.size, connections };
  }

  function closeAll() {
    for (const [principal, bucket] of [...principals.entries()]) {
      for (const [id, connection] of [...bucket.entries()]) {
        try { connection.res.end(); } catch {}
        remove(principal, id);
      }
    }
  }

  return { connect, deliver, presence, snapshot, closeAll };
}
