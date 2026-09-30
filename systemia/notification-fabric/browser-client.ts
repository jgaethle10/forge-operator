export type EvercraftPushRegistration = {
  apiBase?: string;
  principalId: string;
  sessionToken?: string;
  bearerToken?: string;
  audiences?: string[];
  products?: string[];
  preferences?: Partial<Record<'transactional' | 'operational' | 'safety' | 'reminder' | 'marketing', boolean>>;
  timezone?: string;
  quietHours?: { enabled?: boolean; start: string; end: string; timezone?: string };
  serviceWorkerPath?: string;
};

export type RelayConnectionOptions = {
  apiBase?: string;
  sessionToken: string;
  signal?: AbortSignal;
  onNotification?: (payload: any) => void;
  onReady?: (payload: any) => void;
  onState?: (state: 'connecting' | 'connected' | 'closed' | 'error') => void;
};

function apiBase(value?: string) {
  return (value || '').replace(/\/$/, '');
}

function base64UrlToUint8Array(value: string): Uint8Array {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const normalized = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function authHeaders(token?: string) {
  return token ? { authorization: `Bearer ${token}` } : {};
}

export async function registerEvercraftPush(options: EvercraftPushRegistration) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('This browser does not support Web Push.');
  }
  const base = apiBase(options.apiBase);
  const configResponse = await fetch(`${base}/api/notifications/config`, { credentials: 'include' });
  if (!configResponse.ok) throw new Error('Unable to load notification configuration.');
  const config = await configResponse.json();
  if (!config.web_push_enabled || !config.vapid_public_key) throw new Error('Evercraft Web Push is not configured.');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { subscribed: false, permission };

  const registration = await navigator.serviceWorker.register(options.serviceWorkerPath || '/evercraft-push-sw.js');
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToUint8Array(config.vapid_public_key) as BufferSource,
  });
  const json = subscription.toJSON();
  const token = options.sessionToken || options.bearerToken;
  const response = await fetch(`${base}/api/notifications/subscriptions`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({
      principal_id: options.principalId,
      endpoint: json.endpoint,
      keys: json.keys,
      audiences: options.audiences || [],
      products: options.products || [],
      preferences: options.preferences || {},
      locale: navigator.language,
      timezone: options.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      quiet_hours: options.quietHours || null,
    }),
  });
  if (!response.ok) throw new Error(`Evercraft push registration failed (${response.status}).`);
  return { subscribed: true, permission, subscription: await response.json() };
}

function parseSseFrame(frame: string) {
  let event = 'message';
  let id: string | null = null;
  const data: string[] = [];
  for (const line of frame.split('\n')) {
    if (!line || line.startsWith(':')) continue;
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('id:')) id = line.slice(3).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
  }
  if (!data.length) return null;
  let payload: any = data.join('\n');
  try { payload = JSON.parse(payload); } catch {}
  return { event, id, payload };
}

export async function connectEvercraftRelay(options: RelayConnectionOptions) {
  const base = apiBase(options.apiBase);
  options.onState?.('connecting');
  const response = await fetch(`${base}/api/notifications/stream`, {
    method: 'GET',
    credentials: 'include',
    headers: { accept: 'text/event-stream', ...authHeaders(options.sessionToken) },
    signal: options.signal,
  });
  if (!response.ok || !response.body) {
    options.onState?.('error');
    throw new Error(`Evercraft Relay connection failed (${response.status}).`);
  }
  options.onState?.('connected');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const parsed = parseSseFrame(frame);
        if (parsed?.event === 'relay.ready') options.onReady?.(parsed.payload);
        else if (parsed?.event === 'notification') options.onNotification?.(parsed.payload);
        boundary = buffer.indexOf('\n\n');
      }
    }
    options.onState?.('closed');
  } catch (error) {
    if (options.signal?.aborted) {
      options.onState?.('closed');
      return;
    }
    options.onState?.('error');
    throw error;
  } finally {
    reader.releaseLock();
  }
}

export async function getEvercraftRelayInbox(options: { apiBase?: string; sessionToken: string; limit?: number; unreadOnly?: boolean }) {
  const base = apiBase(options.apiBase);
  const params = new URLSearchParams();
  if (options.limit) params.set('limit', String(options.limit));
  if (options.unreadOnly) params.set('unread', 'true');
  const response = await fetch(`${base}/api/notifications/inbox?${params.toString()}`, {
    credentials: 'include',
    headers: authHeaders(options.sessionToken),
  });
  if (!response.ok) throw new Error(`Relay inbox request failed (${response.status}).`);
  return response.json();
}

export async function acknowledgeEvercraftRelayNotification(options: { apiBase?: string; sessionToken: string; notificationId: string }) {
  const base = apiBase(options.apiBase);
  const response = await fetch(`${base}/api/notifications/inbox/${encodeURIComponent(options.notificationId)}/ack`, {
    method: 'POST',
    credentials: 'include',
    headers: authHeaders(options.sessionToken),
  });
  if (!response.ok) throw new Error(`Relay acknowledgement failed (${response.status}).`);
  return response.json();
}
