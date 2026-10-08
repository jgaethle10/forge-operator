// Raven Twilio provider inspection. GET ONLY: no purchases, webhook edits or contact.
// Run with authorized TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN; output is PII-minimized.
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const NUMBER = '+15095672403';
const ROOT = 'https://api.twilio.com/2010-04-01';
const id = x => x ? createHash('sha256').update(String(x)).digest('hex').slice(0, 20) : null;
function endpoint(x) {
  if (!x) return null;
  try {
    const u = new URL(x);
    return { host: u.protocol === 'https:' ? u.hostname : null,
      path: u.protocol === 'https:' ? u.pathname : null,
      secure: u.protocol === 'https:', query_redacted: !!(u.search || u.hash || u.username || u.password) };
  } catch { return { host: null, path: null, secure: false, query_redacted: true }; }
}
const entries = (xs, kind) => xs.filter(x => x.direction === 'inbound').slice(0, 10).map(x => ({
  event_key: id(x.sid), kind, status: String(x.status || '').slice(0, 60),
  created_at: x.date_created || x.start_time || null, error_code: x.error_code ?? null,
}));
export async function inspectRavenTwilio({ env = process.env, transport = fetch } = {}) {
  const sid = String(env.TWILIO_ACCOUNT_SID || ''), token = String(env.TWILIO_AUTH_TOKEN || '');
  if (!/^AC[0-9a-fA-F]{32}$/.test(sid) || !token) throw new Error('credentials_unavailable');
  const auth = 'Basic ' + Buffer.from(sid + ':' + token).toString('base64');
  async function get(resource) {
    const url = new URL(ROOT + '/Accounts/' + sid + '/' + resource + '.json');
    url.searchParams.set(resource === 'IncomingPhoneNumbers' ? 'PhoneNumber' : 'To', NUMBER);
    url.searchParams.set('PageSize', '20');
    const r = await transport(url.toString(), { method: 'GET', redirect: 'error',
      headers: { authorization: auth, accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    const raw = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data: r.ok ? raw : {}, code: r.ok ? null : String(raw.code || 'unknown').slice(0, 32) };
  }
  const [n, c, m] = await Promise.all([get('IncomingPhoneNumbers'), get('Calls'), get('Messages')]);
  const number = n.ok ? (n.data.incoming_phone_numbers || []).find(x => x.phone_number === NUMBER) : null;
  return {
    schema: 'evercraft.raven.twilio-readonly-inspection.v1', observed_at: new Date().toISOString(),
    target_number: NUMBER, provider_api_auth_confirmed: n.ok && c.ok && m.ok,
    provider_number_found: !!number,
    http: { number: [n.status, n.code], calls: [c.status, c.code], messages: [m.status, m.code] },
    routing: number ? {
      voice: endpoint(number.voice_url), voice_method: number.voice_method || null,
      status_callback: endpoint(number.status_callback),
      sms: endpoint(number.sms_url), sms_method: number.sms_method || null,
      voice_capability: number.capabilities?.voice ?? null,
      sms_capability: number.capabilities?.sms ?? null,
    } : null,
    calls: c.ok ? entries(c.data.calls || [], 'voice') : [],
    messages: m.ok ? entries(m.data.messages || [], 'sms') : [],
    delivery_verified: false, owner_acknowledged: false,
    webhook_mutated: false, outbound_contact_sent: false,
    note: 'Provider API metadata is not proof of webhook delivery, registration, consent or settlement.',
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  inspectRavenTwilio().then(r => {
    process.stdout.write(JSON.stringify(r, null, 2) + '\n');
    if (!r.provider_api_auth_confirmed || !r.provider_number_found) process.exitCode = 2;
  }).catch(() => { process.stderr.write('twilio_readonly_inspection_unavailable\n'); process.exitCode = 2; });
}
