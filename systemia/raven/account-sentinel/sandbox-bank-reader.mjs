// Provider-neutral *sandbox contract*, not a live bank integration.
// Only privileged Raven services may construct this adapter or supply its
// token vault, allowlist and HTTP transport. Never pass agent-controlled
// configuration, credentials, origins, headers, or raw request bodies here.
const READ_PATHS = Object.freeze({
  'account.read': 'summary',
  'balance.read': 'balances',
  'transactions.read': 'transactions',
});
const strictKeys = (obj, keys) => obj !== null && typeof obj === 'object' &&
  !Array.isArray(obj) && Object.keys(obj).sort().join('|') === [...keys].sort().join('|');
const fail = () => { throw new Error('sandbox_bank_read_rejected'); };
const numeric = v => typeof v === 'number' && Number.isFinite(v) ? v : null;
const limited = (v, n = 80) => typeof v === 'string' && v.length > 0
  ? v.slice(0, n) : null;
const currency = v => typeof v === 'string' && /^[A-Z]{3}$/.test(v) ? v : null;
const cleanAccount = raw => ({
  account_label: limited(raw?.account_label),
  currency: currency(raw?.currency),
  account_type: ['checking', 'savings', 'credit'].includes(raw?.account_type)
    ? raw.account_type : null,
  last4: typeof raw?.last4 === 'string' && /^\d{4}$/.test(raw.last4)
    ? raw.last4 : null,
});
function project(operation, raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !currency(raw.currency))
    fail();
  const shared = { source_environment: 'sandbox', simulated: raw.simulated === true };
  if (operation === 'account.read') return Object.freeze({
    ...shared, ...cleanAccount(raw),
  });
  if (operation === 'balance.read') {
    if (numeric(raw.available_balance) === null) fail();
    return Object.freeze({
      ...shared, account_label: limited(raw.account_label),
      currency: raw.currency, available_balance: raw.available_balance,
    });
  }
  if (operation === 'transactions.read') {
    if (!Array.isArray(raw.transactions) || raw.transactions.length > 25) fail();
    const transactions = raw.transactions.map(t => {
      if (!t || typeof t !== 'object' || !currency(t.currency) ||
          numeric(t.amount) === null ||
          typeof t.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(t.date))
        fail();
      return Object.freeze({
        amount: t.amount, currency: t.currency, date: t.date,
        description: limited(t.description, 100),
      });
    });
    return Object.freeze({ ...shared, currency: raw.currency,
      transactions: Object.freeze(transactions) });
  }
  return fail();
}
async function readJsonBounded(response, maxBytes) {
  if (!response?.ok || !(response.headers?.get('content-type') || '')
    .toLowerCase().startsWith('application/json') || !response.body?.getReader) fail();
  const reader = response.body.getReader();
  let size = 0;
  const chunks = [];
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      if (!(next.value instanceof Uint8Array)) fail();
      size += next.value.byteLength;
      if (size > maxBytes) fail();
      chunks.push(Buffer.from(next.value));
    }
  } finally {
    try { await reader.cancel(); } catch { /* no body retained */ }
  }
  if (size === 0) fail();
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export function createSandboxBankReader({
  connector, allowedSandboxOrigins, tokenVault, transport,
  timeoutMs = 3000, maxResponseBytes = 32768,
} = {}) {
  if (!connector || connector.environment !== 'sandbox' ||
      connector.sandbox_only !== true || connector.approved !== true ||
      connector.status !== 'active' || connector.read_only !== true ||
      connector.mode !== 'delegated_oauth' ||
      !Array.isArray(connector.scopes) ||
      typeof connector.connector_id !== 'string' ||
      typeof connector.api_origin !== 'string' ||
      !Array.isArray(allowedSandboxOrigins) ||
      !allowedSandboxOrigins.includes(connector.api_origin) ||
      !tokenVault || typeof tokenVault.getAccessToken !== 'function' ||
      typeof transport !== 'function' ||
      !Number.isInteger(timeoutMs) || timeoutMs < 50 || timeoutMs > 10000 ||
      !Number.isInteger(maxResponseBytes) ||
      maxResponseBytes < 512 || maxResponseBytes > 65536) fail();

  let origin;
  try {
    const u = new URL(connector.api_origin);
    if (u.protocol !== 'https:' || u.username || u.password ||
        u.pathname !== '/' || u.search || u.hash || u.port ||
        u.origin !== connector.api_origin || !u.hostname.includes('.')) fail();
    origin = u.origin;
  } catch { fail(); }

  return Object.freeze({
    async read(request) {
      if (!strictKeys(request, ['operation', 'account_ref', 'connector_id']) ||
          request.connector_id !== connector.connector_id ||
          !Object.hasOwn(READ_PATHS, request.operation) ||
          typeof request.account_ref !== 'string' ||
          !/^[A-Za-z0-9._:-]{1,120}$/.test(request.account_ref)) fail();
      const scope = {
        'account.read': 'accounts:read',
        'balance.read': 'balances:read',
        'transactions.read': 'transactions:read',
      }[request.operation];
      if (!connector.scopes.includes(scope)) fail();
      // URL and verb are generated from closed enums, never from the agent.
      const path = '/v1/accounts/' + encodeURIComponent(request.account_ref) +
        '/' + READ_PATHS[request.operation];
      const url = origin + path +
        (request.operation === 'transactions.read' ? '?limit=25' : '');
      let controller;
      let timer;
      try {
        const token = await tokenVault.getAccessToken({
          connector_id: connector.connector_id,
          environment: 'sandbox',
        });
        if (typeof token !== 'string' || token.length < 8 ||
            token.length > 4096 || /[\s\r\n]/.test(token)) fail();
        controller = new AbortController();
        const expiry = new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error('bank_sandbox_timeout'));
          }, timeoutMs);
        });
        const response = await Promise.race([
          Promise.resolve().then(() => transport(url, {
            method: 'GET', redirect: 'error', credentials: 'omit',
            headers: Object.freeze({
              accept: 'application/json',
              authorization: 'Bearer ' + token,
              'cache-control': 'no-store',
            }),
            signal: controller.signal,
          })),
          expiry,
        ]);
        const raw = await Promise.race([readJsonBounded(response, maxResponseBytes), expiry]);
        return project(request.operation, raw);
      } catch {
        // No provider payload, transport stack, access token or URL in errors.
        throw new Error('sandbox_bank_read_rejected');
      } finally {
        if (timer) clearTimeout(timer);
        if (controller) controller.abort();
      }
    },
  });
}
