// DayTrade Lens: credential canary for Alpaca PAPER only.
// Read-only. Does not expose secrets, account numbers, or perform trades.
const PAPER_ACCOUNT_URL = 'https://paper-api.alpaca.markets/v2/account';

export function selectPaperProbeCredentials(env = {}) {
  const paperAny = Boolean(env.ALPACA_PAPER_KEY_ID || env.ALPACA_PAPER_SECRET_KEY);
  const paperBoth = Boolean(env.ALPACA_PAPER_KEY_ID && env.ALPACA_PAPER_SECRET_KEY);
  if (paperAny && !paperBoth) return null; // Never substitute a half-configured pair.
  if (paperBoth) {
    return { key: env.ALPACA_PAPER_KEY_ID, secret: env.ALPACA_PAPER_SECRET_KEY, source: 'dedicated_paper_pair' };
  }
  const legacyBoth = Boolean(env.ALPACA_TRADING && env.ALPACA_TRADING_SECRET);
  if (!legacyBoth) return null;
  // Legacy keys allowed solely for a GET against the PAPER URL. No order-writing rights.
  return { key: env.ALPACA_TRADING, secret: env.ALPACA_TRADING_SECRET, source: 'legacy_pair_paper_read_probe_only' };
}

export async function probePaperAccount({ credentials, fetchImpl = globalThis.fetch } = {}) {
  if (!credentials?.key || !credentials?.secret) throw Error('paper_probe_credentials_missing');
  if (typeof fetchImpl !== 'function') throw Error('paper_probe_fetch_missing');
  const url = new URL(PAPER_ACCOUNT_URL);
  if (url.origin !== 'https://paper-api.alpaca.markets' || url.pathname !== '/v2/account') {
    throw Error('paper_probe_host_invalid');
  }
  let response;
  try {
    response = await fetchImpl(url.href, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'APCA-API-KEY-ID': credentials.key,
        'APCA-API-SECRET-KEY': credentials.secret,
        'accept': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw Error('paper_probe_network_or_timeout');
  }
  if (response.redirected || (response.status >= 300 && response.status < 400)) {
    throw Error('paper_probe_redirect_blocked');
  }
  if (!response.ok) throw Error('paper_probe_http_' + (Number(response.status) || 'unknown'));
  let account;
  try { account = await response.json(); }
  catch { throw Error('paper_probe_json_invalid'); }
  if (!account || typeof account !== 'object' || Array.isArray(account) ||
      typeof account.status !== 'string' || !account.status) {
    throw Error('paper_probe_response_invalid');
  }
  return Object.freeze({
    schema: 'evercraft.daytrade.paper-auth-canary.v1',
    endpoint: 'ALPACA_PAPER_ONLY',
    source: credentials.source || 'unspecified',
    paper_api_authenticated: true,
    account_active: account.status === 'ACTIVE',
    broker_orders_submitted: 0,
    live_trade_authority: false,
    at: new Date().toISOString(),
  });
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  const creds = selectPaperProbeCredentials(process.env);
  try {
    const receipt = await probePaperAccount({ credentials: creds });
    console.log(JSON.stringify(receipt));
    if (!receipt.account_active) process.exitCode = 2;
  } catch (err) {
    const reason = /^paper_probe_[a-z0-9_]+$/.test(err?.message || '')
      ? err.message : 'paper_probe_unknown_failure';
    console.log(JSON.stringify({
      schema: 'evercraft.daytrade.paper-auth-canary.v1',
      state: 'BLOCKED',
      reason,
      broker_orders_submitted: 0,
      live_trade_authority: false,
    }));
    process.exitCode = 1;
  }
}
