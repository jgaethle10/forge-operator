export type EvercraftPushRegistration = {
  apiBase?: string;
  principalId: string;
  bearerToken?: string;
  audiences?: string[];
  products?: string[];
  preferences?: Partial<Record<'transactional' | 'operational' | 'safety' | 'reminder' | 'marketing', boolean>>;
  serviceWorkerPath?: string;
};

function base64UrlToUint8Array(value: string): Uint8Array {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const normalized = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

export async function registerEvercraftPush(options: EvercraftPushRegistration) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('This browser does not support Web Push.');
  }
  const apiBase = (options.apiBase || '').replace(/\/$/, '');
  const configResponse = await fetch(`${apiBase}/api/notifications/config`, { credentials: 'include' });
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
  const response = await fetch(`${apiBase}/api/notifications/subscriptions`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      ...(options.bearerToken ? { authorization: `Bearer ${options.bearerToken}` } : {}),
    },
    body: JSON.stringify({
      principal_id: options.principalId,
      endpoint: json.endpoint,
      keys: json.keys,
      audiences: options.audiences || ['company-ops'],
      products: options.products || [],
      preferences: options.preferences || {},
      locale: navigator.language,
    }),
  });
  if (!response.ok) throw new Error(`Evercraft push registration failed (${response.status}).`);
  return { subscribed: true, permission, subscription: await response.json() };
}
