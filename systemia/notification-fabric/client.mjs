function boundedInteger(value, label, fallback, minimum, maximum) {
  const candidate = value === undefined || value === null || value === '' ? fallback : Number(value);
  if (!Number.isFinite(candidate) || !Number.isInteger(candidate) || candidate < minimum || candidate > maximum) {
    throw new Error(`${label} must be an integer between ${minimum} and ${maximum}.`);
  }
  return candidate;
}

function normalizeBaseUrl(value) {
  const url = new URL(String(value || '').trim());
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new Error('Notification Fabric base URL must use HTTPS.');
  }
  return url.origin;
}

export function createNotificationClient(options = {}) {
  const baseUrl = normalizeBaseUrl(options.baseUrl || process.env.EVERCRAFT_NOTIFICATION_BASE_URL || 'http://localhost:3000');
  const token = String(options.token ?? process.env.EVERCRAFT_NOTIFICATION_INGEST_TOKEN ?? '').trim();
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = boundedInteger(options.timeoutMs, 'Notification Fabric client timeoutMs', 5000, 250, 30000);

  if (!token) throw new Error('Notification Fabric ingest token is required.');

  async function request(pathname, init = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${baseUrl}${pathname}`, {
        ...init,
        headers: {
          authorization: `Bearer ${token}`,
          ...(init.headers || {}),
        },
        signal: controller.signal,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body?.error || `Notification Fabric request failed (${response.status}).`);
      }
      return body;
    } finally {
      clearTimeout(timer);
    }
  }

  async function post(pathname, payload, extraHeaders = {}) {
    return request(pathname, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...extraHeaders,
      },
      body: JSON.stringify(payload),
    });
  }

  return {
    notify(intent) { return post('/api/notifications/intents', intent); },
    signal(signal) { return post('/api/notifications/signals', signal); },
    enqueue(intent, optionsEnqueue = {}) {
      const headers = optionsEnqueue.idempotencyKey ? { 'idempotency-key': String(optionsEnqueue.idempotencyKey) } : {};
      return post('/api/notifications/jobs', { intent, max_attempts: optionsEnqueue.maxAttempts }, headers);
    },
    enqueueSignal(signal, optionsEnqueue = {}) {
      const headers = optionsEnqueue.idempotencyKey ? { 'idempotency-key': String(optionsEnqueue.idempotencyKey) } : {};
      return post('/api/notifications/signal-jobs', { signal, max_attempts: optionsEnqueue.maxAttempts }, headers);
    },
    getJob(jobId) {
      return request(`/api/notifications/jobs/${encodeURIComponent(String(jobId))}`, { method: 'GET' });
    },
    requeueJob(jobId, optionsRequeue = {}) {
      return post(
        `/api/notifications/jobs/${encodeURIComponent(String(jobId))}/requeue`,
        { max_attempts: optionsRequeue.maxAttempts }
      );
    },
    issueSession(input) { return post('/api/notifications/session-tokens', input); },
  };
}
