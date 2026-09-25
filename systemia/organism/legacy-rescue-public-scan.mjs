#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { extractCandidateLinks, newCandidateLinks } from './legacy-rescue-link-discovery.mjs';

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
}

function normalizeBody(value) {
  return String(value ?? '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--([\s\S]*?)-->/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function literalPrivateHost(hostname) {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host === '::1' || host.endsWith('.local')) return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
  const m = host.match(/^172\.(\d+)\./);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  return false;
}

export function validatePublicSource(source) {
  if (!source || !clean(source.key) || !clean(source.url)) throw new Error('source key and url are required');
  const url = new URL(source.url);
  if (url.protocol !== 'https:') throw new Error(`source ${source.key} must use https`);
  if (literalPrivateHost(url.hostname)) throw new Error(`source ${source.key} points to a private/local host`);
  if (Array.isArray(source.allowed_hosts) && source.allowed_hosts.length) {
    const allowed = new Set(source.allowed_hosts.map((host) => clean(host).toLowerCase()));
    if (!allowed.has(url.hostname.toLowerCase())) throw new Error(`source ${source.key} host is not allowlisted`);
  }
  return { ...source, key: clean(source.key), url: url.toString() };
}

function due(previous, source, nowMs) {
  const minMinutes = Math.max(5, Number(source.min_poll_minutes || 30));
  const last = Date.parse(previous?.last_checked_at || '');
  if (!Number.isFinite(last)) return true;
  return nowMs - last >= minMinutes * 60_000;
}

function sourceSignal(source, changeType, observedAt, fingerprint, overrides = {}) {
  const signalUrl = clean(overrides.url || source.url);
  return {
    signal_key: `public-source|${source.key}|${fingerprint}`,
    source: source.name || source.key,
    title: clean(overrides.title || source.signal_title || `${source.name || source.key} changed`),
    url: signalUrl,
    change_type: changeType,
    published_at: observedAt,
    deadline: clean(source.deadline || ''),
    evidence_refs: [...new Set([`public-source:${source.key}`, source.url, signalUrl, ...(overrides.evidence_refs || [])].filter(Boolean))],
    urgency: Number(source.urgency || 0),
    buyer_access: Number(source.buyer_access || 0),
    proofability: Number(source.proofability || 0),
    evidence_quality: Number(source.evidence_quality || 0),
    days_to_cash: Number(source.days_to_cash || 0),
  };
}

export async function scanLegacyRescuePublicSources({
  sources = [],
  previousState = {},
  fetchImpl = fetch,
  now = new Date(),
} = {}) {
  const observedAt = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const nowMs = Date.parse(observedAt);
  const nextState = { schema: 'evercraft.legacy-rescue-public-source-state.v1', updated_at: observedAt, sources: {} };
  const signals = [];
  const receipts = [];

  for (const raw of sources) {
    const source = validatePublicSource(raw);
    const previous = previousState?.sources?.[source.key] || null;

    if (!due(previous, source, nowMs)) {
      nextState.sources[source.key] = previous;
      receipts.push({ key: source.key, state: 'skipped_not_due', url: source.url });
      continue;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.max(3000, Number(source.timeout_ms || 15000)));
    let response;
    try {
      response = await fetchImpl(source.url, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          accept: 'text/html,application/json,text/plain;q=0.9,*/*;q=0.5',
          'user-agent': 'Evercraft-Systemia-Legacy-Rescue-Watch/1.0 (+public-change-monitor)',
        },
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timeout);
      nextState.sources[source.key] = {
        ...(previous || {}),
        url: source.url,
        last_checked_at: observedAt,
        last_error: error instanceof Error ? error.message : String(error),
      };
      receipts.push({ key: source.key, state: 'fetch_error', url: source.url, error: nextState.sources[source.key].last_error });
      continue;
    }
    clearTimeout(timeout);

    if (!response?.ok) {
      nextState.sources[source.key] = {
        ...(previous || {}),
        url: source.url,
        last_checked_at: observedAt,
        last_http_status: Number(response?.status || 0),
      };
      receipts.push({ key: source.key, state: 'http_error', url: source.url, status: Number(response?.status || 0) });
      continue;
    }

    const rawBody = await response.text();
    const body = normalizeBody(rawBody);
    const fingerprint = sha256(body);
    const firstSeen = !previous?.fingerprint;
    const changed = Boolean(previous?.fingerprint && previous.fingerprint !== fingerprint);
    const discoveredLinks = source.discover_links === true ? extractCandidateLinks(rawBody, source) : [];
    const newLinks = source.discover_links === true ? newCandidateLinks(previous?.known_links || [], discoveredLinks) : [];

    nextState.sources[source.key] = {
      url: source.url,
      fingerprint,
      bytes: Buffer.byteLength(body, 'utf8'),
      last_checked_at: observedAt,
      last_changed_at: changed || firstSeen ? observedAt : previous?.last_changed_at || null,
      last_http_status: Number(response.status || 200),
      last_error: null,
      known_links: discoveredLinks,
    };

    if ((firstSeen && source.emit_on_first_seen === true) || (changed && source.emit_body_change_signal !== false)) {
      signals.push(sourceSignal(source, firstSeen ? 'new_signal' : 'amendment', observedAt, fingerprint));
    }

    const linksToEmit = firstSeen && source.emit_links_on_first_seen !== true ? [] : newLinks;
    for (const link of linksToEmit) {
      signals.push(sourceSignal(
        source,
        'new_signal',
        observedAt,
        sha256(link.url),
        {
          title: link.title || `${source.name || source.key} discovered a new legacy-modernization link`,
          url: link.url,
          evidence_refs: [`listing-source:${source.url}`],
        },
      ));
    }

    receipts.push({
      key: source.key,
      state: firstSeen ? 'seeded' : changed ? 'changed' : 'unchanged',
      url: source.url,
      fingerprint,
      bytes: nextState.sources[source.key].bytes,
      discovered_links: discoveredLinks.length,
      new_links: newLinks.length,
      emitted_link_signals: linksToEmit.length,
    });
  }

  return {
    schema: 'evercraft.legacy-rescue-public-scan.v1',
    workflow_key: 'legacy-rescue-opportunity-watch',
    observed_at: observedAt,
    signals,
    state: nextState,
    receipts,
  };
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

async function main() {
  const args = process.argv.slice(2);
  const value = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
  };
  const configFile = value('--config', 'systemia/organism/legacy-rescue-public-sources.json');
  const stateFile = value('--state', 'artifacts/legacy-rescue-watch/source-state.json');
  const signalsFile = value('--signals', 'artifacts/legacy-rescue-watch/signals.json');
  const receiptFile = value('--receipt', 'artifacts/legacy-rescue-watch/public-scan.json');

  const config = readJson(configFile, null);
  if (!config || !Array.isArray(config.sources)) throw new Error('public source config with sources[] is required');
  const previousState = readJson(stateFile, { sources: {} });
  const result = await scanLegacyRescuePublicSources({
    sources: config.sources.filter((source) => source.enabled !== false),
    previousState,
    now: new Date(),
  });

  atomicJson(stateFile, result.state);
  atomicJson(signalsFile, { schema: 'evercraft.legacy-rescue-signal-feed.v1', generated_at: result.observed_at, signals: result.signals });
  atomicJson(receiptFile, result);

  console.log(JSON.stringify({
    ok: true,
    sources: result.receipts.length,
    changed: result.signals.length,
    signals_file: signalsFile,
    state_file: stateFile,
  }));
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  await main();
}
