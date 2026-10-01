import { extractPortForwardingState } from './tree-parser.js';

const VERSION = '0.2.0';
const SETTINGS_URL = 'chrome://os-settings/crostini/portForwarding';
const DEFAULT_ENDPOINT = 'http://127.0.0.1:18081/v1/chromeos-host-boundary/report';
const HEARTBEAT_ALARM = 'evercraft-host-boundary-heartbeat';
const REQUEST_POLL_ALARM = 'evercraft-host-boundary-request-poll';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
      const root = await getDesktop();
      const parsed = extractPortForwardingState(
        root,
        undefined,
        { expectedSurface: true },
      );
      if (
        parsed.settings_surface_observed &&
        parsed.diagnostics?.matched_ports > 0
      ) {
        return { root, source, expectedSurface: true };
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

async function reportObservation(requestId = null) {
  const cfg = await config();
  if (!cfg.enabled) return { ok: false, state: 'disabled' };
  if (cfg.token.length < 32) return { ok: false, state: 'pairing_required' };

  let scan;
  let treeSource = 'unavailable';
  let error = null;
  try {
    const { root, source, expectedSurface } = await openSettingsTree();
    treeSource = source;
    scan = extractPortForwardingState(
      root,
      undefined,
      { expectedSurface: expectedSurface === true },
    );
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

  const payload = {
    schema: 'evercraft.chromeos-host-boundary-observation.v1',
    capability_id: 'chromeos.crostini.port-forwarding.read.v1',
    collected_at: new Date().toISOString(),
    request_id: requestId,
    observer_version: VERSION,
    observer_install_id: cfg.installId,
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
      error,
    },
    authority: {
      read_only: true,
      mutation_requested: false,
    },
  };

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
