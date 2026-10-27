import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FEED_URL, parseSymbols, normalizeMarketMessage, shouldKeepQuote, getObserverConfig } from './live-market-observer.mjs';

test('hardcodes read-only IEX feed and limits symbols', () => {
  assert.equal(FEED_URL, 'wss://stream.data.alpaca.markets/v2/iex');
  assert.deepEqual(parseSymbols('spy, qqq, spy'), ['SPY', 'QQQ']);
  assert.throws(() => parseSymbols('SPY,bad name'), /invalid_observer_universe/);
  assert.throws(() => parseSymbols(Array.from({length:16},(_,i)=>'S'+i).join(',')), /invalid_observer_universe/);
});

test('only normalizes market payloads with valid timestamps and prices', () => {
  const symbols = new Set(['SPY']);
  const msg = { T:'q', S:'SPY', t:'2026-10-27T13:30:00.000Z', bp:100, ap:100.05, bs:10, as:20 };
  const good = normalizeMarketMessage(msg, '2026-10-27T13:30:00.500Z', symbols);
  assert.equal(good.freshness, 'FRESH_FOR_OBSERVATION');
  assert.equal(good.mode, 'MARKET_DATA_OBSERVATION_ONLY');
  assert.equal(good.source_age_ms, 500);
  assert.equal(normalizeMarketMessage({...msg, ap:99}, '2026-10-27T13:30:00.500Z', symbols), null);
  assert.equal(normalizeMarketMessage({...msg, S:'FAKE'}, '2026-10-27T13:30:00.500Z', symbols), null);
  assert.equal(normalizeMarketMessage({...msg, t:'not-a-time'}, '2026-10-27T13:30:00.500Z', symbols), null);
  assert.equal(normalizeMarketMessage({...msg, T:'order'}, '2026-10-27T13:30:00.500Z', symbols), null);
  assert.equal(normalizeMarketMessage(msg, '2026-10-27T13:31:00.500Z', symbols).freshness, 'STALE_OR_CLOCK_SKEW');
});

test('samples quote rate without discarding bars', () => {
  const seen = new Map();
  const quote = {type:'quote',symbol:'SPY',received_at:'2026-10-27T13:30:00.000Z'};
  assert.equal(shouldKeepQuote(quote,seen), true);
  assert.equal(shouldKeepQuote({...quote,received_at:'2026-10-27T13:30:02.000Z'},seen), false);
  assert.equal(shouldKeepQuote({...quote,received_at:'2026-10-27T13:30:05.000Z'},seen), true);
  assert.equal(shouldKeepQuote({...quote,type:'minute_bar'},seen), true);
});

test('refuses absent market data keys or unsafe indefinite sessions', () => {
  const now = new Date('2026-10-27T12:30:00.000Z');
  const env = {DAYTRADE_DATA_KEY_ID:'test',DAYTRADE_DATA_SECRET_KEY:'test-secret',DAYTRADE_OBSERVER_STOP_AT:'2026-10-27T20:10:00.000Z'};
  assert.equal(getObserverConfig(env,now).symbols[0],'SPY');
  assert.throws(()=>getObserverConfig({...env,DAYTRADE_DATA_KEY_ID:''},now),/dedicated_market_data_credentials_required/);
  assert.throws(()=>getObserverConfig({...env,DAYTRADE_OBSERVER_STOP_AT:'2026-10-26T20:10:00.000Z'},now),/future_stop_at_within_24h_required/);
});
