export const SIGNAL_PILOT = Object.freeze({
  id: 'signal-incident-evidence-brief-pilot-v1',
  name: 'Incident Evidence Brief',
  price_usd: 250,
  currency: 'USD',
  scope: 'One publicly documented incident, one bounded decision question, up to six public source URLs, a concise sourced written brief.',
  payment_state: 'scope_request_only_no_checkout',
  delivery_state: 'human_scope_and_capacity_confirmation_required'
});

const compact = (value) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
function field(value, label, min, max, optional = false) {
  const text = compact(value);
  if (optional && !text) return '';
  if (text.length < min || text.length > max) throw new Error(label + ' must be ' + min + '–' + max + ' characters.');
  return text;
}

export function prepareSignalInquiry(input = {}) {
  const incident = field(input.incident, 'Incident or facility', 4, 120);
  const email = field(input.email, 'Reply email', 0, 200, true);
  if(email&&!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))throw new Error('Reply email must be valid.');
  const question = field(input.question, 'Decision or evidence question', 15, 500);
  const location = field(input.location, 'Location', 0, 120, true);
  const organization = field(input.organization, 'Organization', 0, 100, true);
  const source = field(input.source, 'Optional source URL', 0, 350, true);
  if (source) {
    let url;
    try { url = new URL(source); } catch { throw new Error('Source must be a complete public https URL.'); }
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Source must be a public https URL without credentials.');
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') ||
        /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) {
      throw new Error('Source must not be a private network URL.');
    }
  }

  const subject = 'Evercraft Signal | $250 Incident Evidence Brief | Scope request';
  const body = [
    'EVERCRAFT SIGNAL | INCIDENT EVIDENCE BRIEF',
    'I would like a scope review for the proposed $250 USD founding pilot.',
    '',
    'REPLY EMAIL',
    email||'Please reply directly to this message',
    '',
    'INCIDENT OR FACILITY',
    incident,
    '',
    'WHAT I NEED TO KNOW OR DECIDE',
    question,
    '',
    'LOCATION',
    location || 'Not provided',
    '',
    'ORGANIZATION (OPTIONAL)',
    organization || 'Not provided',
    '',
    'PUBLIC SOURCE (OPTIONAL, NOT YET VERIFIED)',
    source || 'Not provided',
    '',
    'PROPOSED DELIVERABLE',
    'One incident, concise source-linked timeline and claim ledger, disputed/missing evidence, and practical next questions.',
    '',
    'PURCHASE STATUS',
    'This email is a request, not a paid order or authorization to charge.',
    'Please confirm the bounded scope, delivery date, final price, and the exact Evercraft Payments order for Signal before I pay. No unrelated payment link.',
    '',
    'No passwords, payment cards or sensitive records are included in this request.'
  ].join('\n');

  return Object.freeze({
    schema: 'evercraft.signal.scope-request.v1',
    offer_id: SIGNAL_PILOT.id,
    price_proposed_usd: SIGNAL_PILOT.price_usd,
    subject,
    body,
    mailto: 'mailto:jessegaethle10@gmail.com?subject=' + encodeURIComponent(subject) +
      '&body=' + encodeURIComponent(body),
    state: 'customer_draft_only_not_submitted',
    checkout_available: false,
    order_created: false,
    message_sent: false
  });
}
