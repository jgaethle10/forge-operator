import React, { useCallback, useEffect, useState } from 'react';
import { hubspot, Text, Flex, Button } from '@hubspot/ui-extensions';

// SETUP REQUIRED: Replace with your HTTPS, signature-checking Evercraft-owned backend
// and update app-hsmeta.json permittedUrls.fetch before uploading to HubSpot.
const API_URL = 'https://relay.example.invalid/v1/hubspot/deal-status';
const CONFIGURED = !API_URL.includes('.invalid/');
const allowed = new Set(['no_review', 'waiting_for_checkins', 'clarification_needed', 'decision_recorded', 'awaiting_acknowledgments', 'acknowledged']);
const labels = {
  no_review: 'No Relay review linked to this deal',
  waiting_for_checkins: 'Waiting for independent check-ins',
  clarification_needed: 'Structured difference requires human clarification',
  decision_recorded: 'Human decision recorded',
  awaiting_acknowledgments: 'Awaiting acknowledgments',
  acknowledged: 'All expected acknowledgments received',
};

hubspot.extend(({ context }) => <RelayDealCard context={context} />);

function RelayDealCard({ context }) {
  const dealId = String(context?.crm?.objectId ?? '');
  const [status, setStatus] = useState(null);
  const [message, setMessage] = useState('Not connected to a Relay backend.');
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    if (!CONFIGURED || !/^\d{1,18}$/.test(dealId)) {
      setMessage('Pilot integration not configured for this deal.');
      return;
    }
    setPending(true);
    try {
      // HubSpot signs requests made by hubspot.fetch(). A server must verify
      // the signature AND authorize portal, app and actual deal access.
      const response = await hubspot.fetch(API_URL + '?dealId=' + encodeURIComponent(dealId), { method: 'GET', timeout: 5000 });
      if (!response.ok) {
        setStatus(null);
        setMessage('Relay data unavailable. No CRM changes were made.');
        return;
      }
      const data = await response.json();
      if (!data || data.schema !== 'evercraft.relay.hubspot.status.v1' || !allowed.has(data.state)) {
        setStatus(null);
        setMessage('Relay status is not verified.');
        return;
      }
      setStatus(data);
      setMessage('');
    } catch {
      setStatus(null);
      setMessage('Relay data unavailable. No CRM changes were made.');
    } finally {
      setPending(false);
    }
  }, [dealId]);

  useEffect(() => { load(); }, [load]);

  return (
    <Flex direction="column" gap="small">
      <Text format={{ fontWeight: 'bold' }}>Evercraft Relay · Deal alignment</Text>
      <Text>{status ? labels[status.state] : message}</Text>
      {status?.state === 'awaiting_acknowledgments' && (
        <Text>{status.acknowledgedCount ?? 0} of {status.expectedCount ?? 0} acknowledgments recorded for version {status.version ?? 'unknown'}.</Text>
      )}
      <Text>Structured comparison and human-confirmed decisions. Acknowledgment is not proof of understanding.</Text>
      <Button onClick={load} disabled={pending || !CONFIGURED || !/^\d{1,18}$/.test(dealId)}>
        {pending ? 'Checking…' : 'Refresh status'}
      </Button>
      <Text>Private pilot. No HubSpot records are changed by this card.</Text>
    </Flex>
  );
}
