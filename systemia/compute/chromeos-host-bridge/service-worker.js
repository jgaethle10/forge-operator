import {
  extractPortForwardingState,
  locatePortForwardingSurface,
} from './tree-parser.js';
import {
  base64UrlFromBytes,
  canonicalJson,
} from './crypto-protocol.js';

const VERSION = '0.2.0';
const SETTINGS_URL = 'chrome://os-settings/crostini/portForwarding';
const DEFAULT_ENDPOINT = 'http://127.0.0.1:18081/v1/chromeos-host-boundary/report';
const HEARTBEAT_ALARM = 'evercraft-host-boundary-heartbeat';
const REQUEST_POLL_ALARM = 'evercraft-host-boundary-request-poll';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const textEncoder = new TextEncoder();

function openIdentityDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('evercraft-host-boundary-identity', 1);
    request.onerror = () => reject(request.error || new Error('identity_database_open_failed'));
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('identity')) {
        database.createObjectStore('identity');
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function identityDatabaseGet(key) {
  const database = await openIdentityDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction('identity', 'readonly');
      const request = transaction.objectStore('identity').get(key);
      request.onerror = () => reject(request.error || new Error('identity_database_read_failed'));
      request.onsuccess = () => resolve(request.result || null);
    });
  } finally {
    database.close();
  }
}

async function identityDatabasePut(key, value) {
  const database = await openIdentityDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction('identity', 'readwrite');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('identity_database_write_failed'));
      transaction.objectStore('identity').put(value, key);
    });
  } finally {
    database.close();
  }
}

async function nextObserverSequence() {
  const database = await openIdentityDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction('identity', 'readwrite');
      const store = transaction.objectStore('identity');
      const request = store.get('observer-sequence');
      let next = null;
      request.onerror = () => reject(request.error || new Error('observer_sequence_read_failed'));
      request.onsuccess = () => {
        const current = Number(request.result || 0);
        if (!Number.isSafeInteger(current) || current < 0) {
          transaction.abort();
          reject(new Error('observer_sequence_state_invalid'));
          return;
        }
        next = current + 1;
        store.put(next, 'observer-sequence');
      };
      transaction.oncomplete = () => resolve(next);
      transaction.onerror = () => reject(transaction.error || new Error('observer_sequence_write_failed'));
      transaction.onabort = () => {
        if (next !== null) reject(new Error('observer_sequence_transaction_aborted'));
      };
    });
  } finally {
    database.close();
  }
}

function hex(bytes) {
  return [...new Uint8Array(bytes)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

async function publicKeyFingerprint(publicJwk) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    textEncoder.encode(canonicalJson(publicJwk)),
  );
  return 'sha256:' + hex(digest);
}

async function getObserverIdentity() {
  const stored = await identityDatabaseGet('primary');
  if (
    stored?.privateKey &&
    stored?.publicJwk &&
    stored?.observerKeyFingerprint
  ) {
    return stored;
  }

  const generated = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign', 'verify'],
  );
  if (generated.privateKey.extractable !== false) {
    throw new Error('observer_private_key_must_be_non_extractable');
  }
  const publicJwk = await crypto.subtle.exportKey('jwk', generated.publicKey);
  const normalizedPublicJwk = {
    kty: 'EC',
    crv: 'P-256',
    x: publicJwk.x,
    y: publicJwk.y,
    ext: true,
    key_ops: ['verify'],
  };
  const observerKeyFingerprint = await publicKeyFingerprint(normalizedPublicJwk);
  const identity = {
    privateKey: generated.privateKey,
    publicJwk: normalizedPublicJwk,
    observerKeyFingerprint,
  };
  await identityDatabasePut('primary', identity);
  return identity;
}

function bridgeUrl(reportEndpoint, pathname) {
  const url = new URL(reportEndpoint);
  url.pathname = pathname;
  url.search = '';
  url.hash = '';
  return url.toString();
}

function getTree(tabId) {
  return new Promise((resolve, reject) => {
    try {
      chrome.automation.getTree(tabId, (root) => {
        const error = chrome.runtime.lastError;
        if (error) return reject(new Error(error.message));
        if (!root) return reject(new Error('automation_tree_unavailable'));
        resolve(root);
      });
    } catch (error) {
      reject(error);
    }
  });
}

function getTab(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.get(tabId, (tab) => {
      const error = chrome.runtime.lastError;
      if (error) return reject(new Error(error.message));
      if (!tab) return reject(new Error('settings_tab_unavailable'));
      resolve(tab);
    });
  });
}

function expectedSettingsUrl(value) {
  const url = String(value || '').toLowerCase();
  return (
    url.startsWith('chrome://os-settings/') &&
    url.includes('crostini') &&
    url.includes('portforward')
  );
}

function getDesktop() {
  return new Promise((resolve, reject) => {
    try {
      chrome.automation.getDesktop((root) => {
        const error = chrome.runtime.lastError;
        if (error) return reject(new Error(error.message));
        if (!root) return reject(new Error('automation_desktop_unavailable'));
        resolve(root);
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function config() {
  const stored = await chrome.storage.local.get([
    'bridgeEndpoint',
    'pairingToken',
    'installId',
    'enabled',
  ]);
  let installId = String(stored.installId || '');
  if (!installId) {
    installId = 'cros_' + crypto.randomUUID();
    await chrome.storage.local.set({ installId });
  }
  return {
    endpoint: String(stored.bridgeEndpoint || DEFAULT_ENDPOINT),
    token: String(stored.pairingToken || ''),
    installId,
    enabled: stored.enabled !== false,
  };
}

async function openSettingsTree() {
  const previous = await chrome.tabs.query({ active: true, currentWindow: true });
  const priorTabId = previous?.[0]?.id ?? null;
  const created = await chrome.tabs.create({ url: SETTINGS_URL, active: false });
  let source = 'tab_tree';
  try {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await delay(attempt === 0 ? 500 : 250);
      try {
        const tab = await getTab(created.id);
        if (!expectedSettingsUrl(tab.url)) {
          throw new Error('chromeos_port_forwarding_route_not_confirmed');
        }
        const root = await getTree(created.id);
        const parsed = extractPortForwardingState(
          root,
          undefined,
          { expectedSurface: true },
        );
        if (parsed.settings_surface_observed) return { root, source, expectedSurface: true };
      } catch {}
    }

    source = 'desktop_tree';
    if (created.id !== undefined) {
      await chrome.tabs.update(created.id, { active: true });
      await delay(500);
      const tab = await getTab(created.id);
      if (!expectedSettingsUrl(tab.url)) {
        throw new Error('chromeos_port_forwarding_route_not_confirmed');
      }
    }
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const desktopRoot = await getDesktop();
      const located = locatePortForwardingSurface(desktopRoot);
      if (located.ok && located.root) {
        const parsed = extractPortForwardingState(
          located.root,
          undefined,
          { expectedSurface: true },
        );
        if (
          parsed.settings_surface_observed &&
          parsed.diagnostics?.matched_ports > 0
        ) {
          return {
            root: located.root,
            source,
            expectedSurface: true,
            surfaceIsolation: {
              reason: located.reason,
              candidate_count: located.candidate_count,
              selected_node_count: located.selected_node_count,
            },
          };
        }
      }
      await delay(250);
    }
    throw new Error('chromeos_port_forwarding_surface_not_observed');
  } finally {
    if (priorTabId !== null) {
      try { await chrome.tabs.update(priorTabId, { active: true }); } catch {}
    }
    if (created?.id !== undefined) {
      try { await chrome.tabs.remove(created.id); } catch {}
    }
  }
}

async function ensureObserverPairing(cfg, identity) {
  const response = await fetch(
    bridgeUrl(cfg.endpoint, '/v1/chromeos-host-boundary/pair'),
    {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + cfg.token,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        observer_install_id: cfg.installId,
        observer_key_fingerprint: identity.observerKeyFingerprint,
        public_key_jwk: identity.publicJwk,
      }),
    },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok !== true || body?.paired !== true) {
    throw new Error(String(body?.error || 'host_boundary_pairing_failed'));
  }
  if (
    body.observer_install_id !== cfg.installId ||
    body.observer_key_fingerprint !== identity.observerKeyFingerprint
  ) {
    throw new Error('host_boundary_pairing_identity_mismatch');
  }
  return body;
}

async function signObservation(payload, privateKey) {
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    textEncoder.encode(canonicalJson(payload)),
  );
  return base64UrlFromBytes(new Uint8Array(signature));
}

async function reportObservation(requestId = null) {
  const cfg = await config();
  if (!cfg.enabled) return { ok: false, state: 'disabled' };
  if (cfg.token.length < 32) return { ok: false, state: 'pairing_required' };

  const identity = await getObserverIdentity();
  await ensureObserverPairing(cfg, identity);

  let scan;
  let treeSource = 'unavailable';
  let error = null;
  try {
    const {
      root,
      source,
      expectedSurface,
      surfaceIsolation = null,
    } = await openSettingsTree();
    treeSource = source;
    scan = extractPortForwardingState(
      root,
      undefined,
      { expectedSurface: expectedSurface === true },
    );
    scan.surface_isolation = surfaceIsolation;
  } catch (cause) {
    error = String(cause?.message || cause).slice(0, 200);
    scan = {
      settings_surface_observed: false,
      nodes_examined: 0,
      bounded: true,
      diagnostics: {
        toggle_candidates: 0,
        matched_ports: 0,
        unmatched_toggle_candidates: 0,
        raw_tree_persisted: false,
      },
      ports: [18080, 8443].map((port) => ({
        port,
        protocol: 'TCP',
        present: null,
        enabled: null,
        disabled: null,
        evidence: 'settings_surface_not_observed',
      })),
    };
  }

  const observerSequence = await nextObserverSequence();
  const payload = {
    schema: 'evercraft.chromeos-host-boundary-observation.v1',
    capability_id: 'chromeos.crostini.port-forwarding.read.v1',
    collected_at: new Date().toISOString(),
    observer_sequence: observerSequence,
    request_id: requestId,
    observer_version: VERSION,
    observer_install_id: cfg.installId,
    observer_key_fingerprint: identity.observerKeyFingerprint,
    settings_route: SETTINGS_URL,
    ports: scan.ports,
    scan: {
      settings_surface_observed: scan.settings_surface_observed,
      tree_source: treeSource,
      nodes_examined: scan.nodes_examined,
      bounded: scan.bounded,
      toggle_candidates: Number(scan.diagnostics?.toggle_candidates || 0),
      matched_ports: Number(scan.diagnostics?.matched_ports || 0),
      unmatched_toggle_candidates: Number(scan.diagnostics?.unmatched_toggle_candidates || 0),
      surface_isolation: scan.surface_isolation ? {
        reason: String(scan.surface_isolation.reason || '').slice(0, 64),
        candidate_count: Number(scan.surface_isolation.candidate_count || 0),
        selected_node_count: Number(scan.surface_isolation.selected_node_count || 0),
      } : null,
      error,
    },
    authority: {
      read_only: true,
      mutation_requested: false,
    },
  };
  payload.observer_signature = await signObservation(payload, identity.privateKey);

  const response = await fetch(cfg.endpoint, {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + cfg.token,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok !== true) {
    throw new Error(String(body?.error || 'host_boundary_report_failed'));
  }
  await chrome.storage.local.set({
    lastCheckAt: payload.collected_at,
    lastReceiptHash: body.receipt_hash || null,
    observerKeyFingerprint: identity.observerKeyFingerprint,
    lastObserverSequence: observerSequence,
    lastObservation: {
      ports: payload.ports,
      scan: payload.scan,
    },
    lastError: null,
  });
  return { ok: true, receipt_hash: body.receipt_hash || null, payload };
}

async function runAndRecord(requestId = null) {
  try {
    return await reportObservation(requestId);
  } catch (error) {
    await chrome.storage.local.set({
      lastCheckAt: new Date().toISOString(),
      lastError: String(error?.message || error).slice(0, 200),
    });
    return { ok: false, error: String(error?.message || error) };
  }
}

async function pollPendingRequest() {
  const cfg = await config();
  if (!cfg.enabled || cfg.token.length < 32) return { ok: false, state: 'not_ready' };

  const response = await fetch(
    bridgeUrl(cfg.endpoint, '/v1/chromeos-host-boundary/next-request'),
    {
      method: 'GET',
      headers: {
        authorization: 'Bearer ' + cfg.token,
        accept: 'application/json',
      },
    },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok !== true) {
    throw new Error(String(body?.error || 'host_boundary_request_poll_failed'));
  }
  if (!body?.request?.request_id) return { ok: true, state: body?.state || 'none' };

  return runAndRecord(String(body.request.request_id));
}

function ensureAlarms() {
  chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: 10 });
  chrome.alarms.create(REQUEST_POLL_ALARM, { periodInMinutes: 0.5 });
}

chrome.runtime.onInstalled.addListener(() => {
  ensureAlarms();
  runAndRecord();
});

chrome.runtime.onStartup.addListener(() => {
  ensureAlarms();
  pollPendingRequest().catch(() => {});
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === HEARTBEAT_ALARM) runAndRecord();
  if (alarm.name === REQUEST_POLL_ALARM) pollPendingRequest().catch(() => {});
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'evercraft.hostBoundary.checkNow') return false;
  runAndRecord().then(sendResponse);
  return true;
});
