const endpoint = document.querySelector('#endpoint');
const token = document.querySelector('#token');
const enabled = document.querySelector('#enabled');
const status = document.querySelector('#status');

async function refresh() {
  const stored = await chrome.storage.local.get([
    'bridgeEndpoint',
    'pairingToken',
    'enabled',
    'lastCheckAt',
    'lastReceiptHash',
    'observerKeyFingerprint',
    'lastObserverSequence',
    'lastObservation',
    'lastError',
  ]);
  endpoint.value = stored.bridgeEndpoint || 'http://127.0.0.1:18081/v1/chromeos-host-boundary/report';
  token.value = stored.pairingToken || '';
  enabled.checked = stored.enabled !== false;
  const receiver = String(stored.pairingToken || '').length >= 32
    ? await chrome.runtime.sendMessage({
        type: 'evercraft.hostBoundary.status',
      }).catch((error) => ({
        ok: false,
        state: 'receiver_status_unavailable',
        error: error.message,
      }))
    : { ok: false, state: 'pairing_token_required' };

  status.textContent = JSON.stringify({
    token_configured: String(stored.pairingToken || '').length >= 32,
    cryptographic_observer_key:
      stored.observerKeyFingerprint || null,
    last_observer_sequence:
      stored.lastObserverSequence || null,
    receiver_pairing_state:
      receiver.pairing_state || receiver.state || null,
    receiver_paired: receiver.paired === true,
    receiver_observer_key:
      receiver.paired_observer_key_fingerprint || null,
    enabled: stored.enabled !== false,
    last_check_at: stored.lastCheckAt || null,
    last_receipt_hash: stored.lastReceiptHash || null,
    last_observation: stored.lastObservation || null,
    last_error: stored.lastError || receiver.error || null,
  }, null, 2);
}

document.querySelector('#save').addEventListener('click', async () => {
  await chrome.storage.local.set({
    bridgeEndpoint: endpoint.value.trim(),
    pairingToken: token.value.trim(),
    enabled: enabled.checked,
  });
  await refresh();
});

document.querySelector('#check').addEventListener('click', async () => {
  status.textContent = 'Checking ChromeOS host boundary…';
  const response = await chrome.runtime.sendMessage({
    type: 'evercraft.hostBoundary.checkNow',
  }).catch((error) => ({ ok: false, error: error.message }));
  status.textContent = JSON.stringify(response, null, 2);
  setTimeout(refresh, 800);
});

refresh();
