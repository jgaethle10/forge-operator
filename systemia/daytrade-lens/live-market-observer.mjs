import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const FEED_URL = 'wss://stream.data.alpaca.markets/v2/iex';
export const MAX_SYMBOLS = 15;
export const DEFAULT_SYMBOLS = ['SPY', 'QQQ', 'AAPL', 'NVDA', 'BA', 'KO', 'PYPL'];
const SCHEMA = 'evercraft.daytrade.market-data-observation.v1';

export function parseSymbols(value = '') {
  const symbols = String(value).trim() ? String(value).toUpperCase().split(',').map((s) => s.trim()) : DEFAULT_SYMBOLS;
  const unique = [...new Set(symbols)];
  if (!unique.length || unique.length > MAX_SYMBOLS || unique.some((s) => !/^[A-Z][A-Z0-9.]{0,8}$/.test(s))) {
    throw new Error('invalid_observer_universe');
  }
  return unique;
}

export function normalizeMarketMessage(raw, receivedAt, symbolSet) {
  if (!raw || typeof raw !== 'object' || !['q', 'b', 'u'].includes(raw.T)) return null;
  if (!symbolSet.has(raw.S)) return null;
  const observedTime = Date.parse(raw.t);
  const receivedTime = Date.parse(receivedAt);
  if (!Number.isFinite(observedTime) || !Number.isFinite(receivedTime)) return null;
  const ageMs = receivedTime - observedTime;
  const isQuote = raw.T === 'q';
  const fields = isQuote
    ? ['bp', 'ap', 'bs', 'as']
    : ['o', 'h', 'l', 'c', 'v'];
  if (fields.some((key) => !Number.isFinite(raw[key]))) return null;
  if (isQuote && !(raw.bp > 0 && raw.ap > 0 && raw.ap >= raw.bp && raw.bs >= 0 && raw.as >= 0)) return null;
  if (!isQuote && !(raw.o > 0 && raw.h > 0 && raw.l > 0 && raw.c > 0 && raw.v >= 0 && raw.l <= raw.h)) return null;
  const maxAge = isQuote ? 15_000 : 90_000;
  return {
    schema: SCHEMA,
    type: isQuote ? 'quote' : raw.T === 'b' ? 'minute_bar' : 'updated_minute_bar',
    mode: 'MARKET_DATA_OBSERVATION_ONLY',
    source: 'ALPACA_IEX',
    venue_coverage: 'IEX_ONLY_NOT_CONSOLIDATED_SIP',
    symbol: raw.S,
    source_timestamp: raw.t,
    received_at: receivedAt,
    source_age_ms: ageMs,
    freshness: ageMs >= -2000 && ageMs <= maxAge ? 'FRESH_FOR_OBSERVATION' : 'STALE_OR_CLOCK_SKEW',
    data: Object.fromEntries(fields.map((field) => [field, raw[field]])),
  };
}

export function shouldKeepQuote(event, lastQuoteAt, minimumGapMs = 5000) {
  if (event.type !== 'quote') return true;
  const current = Date.parse(event.received_at);
  const previous = lastQuoteAt.get(event.symbol) || 0;
  if (current - previous < minimumGapMs) return false;
  lastQuoteAt.set(event.symbol, current);
  return true;
}

export function getObserverConfig(env = process.env, now = new Date()) {
  const key = env.DAYTRADE_DATA_KEY_ID;
  const secret = env.DAYTRADE_DATA_SECRET_KEY;
  if (!key || !secret) throw new Error('dedicated_market_data_credentials_required');
  const stopAt = Date.parse(env.DAYTRADE_OBSERVER_STOP_AT || '');
  if (!Number.isFinite(stopAt) || stopAt <= now.getTime() || stopAt > now.getTime() + 24 * 3600_000) {
    throw new Error('future_stop_at_within_24h_required');
  }
  return {
    key, secret,
    stopAt,
    symbols: parseSymbols(env.DAYTRADE_OBSERVER_SYMBOLS || ''),
    outputDir: path.resolve(env.DAYTRADE_OBSERVER_OUTPUT_DIR || 'artifacts/daytrade-market-observer'),
  };
}

export async function startObserver({ env = process.env, WebSocketCtor = WebSocket, now = () => new Date() } = {}) {
  const cfg = getObserverConfig(env, now());
  const symbolSet = new Set(cfg.symbols);
  fs.mkdirSync(cfg.outputDir, { recursive: true, mode: 0o700 });
  const file = path.join(cfg.outputDir, 'observer-' + now().toISOString().slice(0, 10) + '.jsonl');
  const fd = fs.openSync(file, 'a', 0o600);
  let socket = null;
  let stopped = false;
  let tries = 0;
  let subscribed = false;
  let lastValid = null;
  let captured = 0;
  let stale = 0;
  let discarded = 0;
  const quoteLast = new Map();
  const append = (kind, extra = {}) => {
    const record = { schema: SCHEMA, kind, at: now().toISOString(), ...extra };
    fs.writeSync(fd, JSON.stringify(record) + '\n');
    fs.fsyncSync(fd);
  };
  const finish = (reason) => {
    if (stopped) return;
    stopped = true;
    clearInterval(heartbeat);
    clearTimeout(shutdown);
    append('observer_stop', { reason, captured, stale, discarded, subscribed });
    try { socket?.close(); } catch {}
    fs.closeSync(fd);
  };
  append('observer_start', { mode: 'READ_ONLY', feed: FEED_URL, symbols: cfg.symbols, stop_at: new Date(cfg.stopAt).toISOString(), broker_order_endpoint_present: false });
  const heartbeat = setInterval(() => append('heartbeat', {
    captured, stale, discarded, subscribed, last_valid_source_at: lastValid,
    state: !subscribed ? 'NOT_SUBSCRIBED' : (lastValid && now().getTime() - Date.parse(lastValid) < 90_000 ? 'DATA_RECEIVED' : 'NO_FRESH_EVENTS'),
  }), 60_000);
  const shutdown = setTimeout(() => finish('configured_session_end'), cfg.stopAt - now().getTime());
  const connect = () => {
    if (stopped) return;
    subscribed = false;
    tries += 1;
    append('connection_attempt', { attempt: tries });
    const ws = new WebSocketCtor(FEED_URL);
    socket = ws;
    let authSent = false;
    let authDone = false;
    let attemptsDone = false;
    const authTimeout = setTimeout(() => {
      if (!subscribed && !stopped) {
        append('authentication_or_subscription_timeout');
        ws.close();
      }
    }, 25_000);
    const sendAuth = () => {
      if (authSent) return;
      authSent = true;
      ws.send(JSON.stringify({ action: 'auth', key: cfg.key, secret: cfg.secret }));
    };
    ws.addEventListener('open', () => {
      append('socket_open');
      sendAuth();
    });
    ws.addEventListener('message', (ev) => {
      let rows;
      try { rows = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data)); }
      catch { discarded++; return; }
      for (const msg of Array.isArray(rows) ? rows : [rows]) {
        if (msg.T === 'success' && msg.msg === 'authenticated' && !authDone) {
          authDone = true;
          ws.send(JSON.stringify({ action: 'subscribe', bars: cfg.symbols, quotes: cfg.symbols }));
          continue;
        }
        if (msg.T === 'subscription') {
          const barSet = new Set(msg.bars || []);
          const quoteSet = new Set(msg.quotes || []);
          subscribed = cfg.symbols.every((sym) => barSet.has(sym) && quoteSet.has(sym));
          append('subscription_status', { subscribed, bar_symbols: [...barSet], quote_symbols: [...quoteSet] });
          if (!subscribed) ws.close();
          else { tries = 0; clearTimeout(authTimeout); }
          continue;
        }
        if (msg.T === 'error') {
          append('feed_error', { code: msg.code ?? null, message: String(msg.msg || '').slice(0, 140) });
          ws.close();
          continue;
        }
        const event = normalizeMarketMessage(msg, now().toISOString(), symbolSet);
        if (!event) { discarded++; continue; }
        if (!shouldKeepQuote(event, quoteLast)) continue;
        if (event.freshness !== 'FRESH_FOR_OBSERVATION') stale++;
        if (event.freshness === 'FRESH_FOR_OBSERVATION') lastValid = event.received_at;
        append('market_event', { event });
        captured++;
      }
    });
    ws.addEventListener('error', () => append('socket_error'));
    ws.addEventListener('close', () => {
      clearTimeout(authTimeout);
      if (!stopped && !attemptsDone) {
        attemptsDone = true;
        subscribed = false;
        append('socket_closed', { attempt: tries });
        if (tries >= 10) { finish('max_connection_failures'); return; }
        setTimeout(connect, Math.min(60_000, 2_000 * 2 ** Math.min(tries, 5)));
      }
    });
  };
  process.once('SIGINT', () => finish('sigint'));
  process.once('SIGTERM', () => finish('sigterm'));
  connect();
  return { outputFile: file, feed: FEED_URL, symbols: cfg.symbols, mode: 'MARKET_DATA_OBSERVATION_ONLY', stop: finish };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  startObserver().then((state) => console.log(JSON.stringify({ started: true, outputFile: state.outputFile, mode: state.mode }))).catch((err) => {
    console.error('DayTrade observer refused to start: ' + err.message);
    process.exitCode = 1;
  });
}
