import dns from 'node:dns/promises';
import net from 'node:net';

const MAX_URL_LENGTH = 4096;
const MAX_ACTIONS = 8;
const MAX_SELECTOR_LENGTH = 512;

function parseIpv4(address) {
  const parts = String(address).split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return parts;
}

function isPrivateIpv4(address) {
  const p = parseIpv4(address);
  if (!p) return true;
  const [a,b,c,d] = p;
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 0 && c === 0) return true;
  if (a === 192 && b === 0 && c === 2) return true;
  if (a === 192 && b === 168) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  if (a >= 224) return true;
  if (a === 255 && b === 255 && c === 255 && d === 255) return true;
  return false;
}

function isPrivateIpv6(address) {
  const value = String(address).toLowerCase().split('%')[0];
  if (value === '::' || value === '::1') return true;

  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIpv4(mapped[1]);

  const first = Number.parseInt(value.split(':')[0] || '0', 16);
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (value.startsWith('2001:db8:') || value === '2001:db8::') return true; // documentation
  return false;
}

export function isNonPublicIp(address) {
  const version = net.isIP(address);
  if (version === 4) return isPrivateIpv4(address);
  if (version === 6) return isPrivateIpv6(address);
  return true;
}

export function normalizePublicHttpUrl(input) {
  const raw = String(input ?? '').trim();
  if (!raw || raw.length > MAX_URL_LENGTH) throw new Error('invalid_url_length');

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('invalid_url');
  }

  if (!['http:','https:'].includes(url.protocol)) throw new Error('unsupported_url_scheme');
  if (!url.hostname) throw new Error('missing_hostname');
  if (url.username || url.password) throw new Error('embedded_credentials_not_allowed');

  const effectivePort = url.port || (url.protocol === 'https:' ? '443' : '80');
  if (!['80','443'].includes(effectivePort)) throw new Error('unsupported_port');
  return url;
}

export async function resolvePublicHost(hostname) {
  const host = String(hostname || '').replace(/^\[|\]$/g,'');
  const literalVersion = net.isIP(host);

  if (literalVersion) {
    if (isNonPublicIp(host)) throw new Error('private_or_reserved_target');
    return [{address:host,family:literalVersion}];
  }

  let addresses;
  try {
    addresses = await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    throw new Error('dns_resolution_failed');
  }

  if (!addresses.length) throw new Error('dns_resolution_empty');
  for (const row of addresses) {
    if (isNonPublicIp(row.address)) throw new Error('private_or_reserved_target');
  }
  return addresses;
}

export async function assertPublicHttpUrl(input) {
  const url = input instanceof URL ? input : normalizePublicHttpUrl(input);
  await resolvePublicHost(url.hostname);
  return url;
}

export async function assertBrowserRequestUrl(input) {
  const raw = String(input ?? '');
  if (/^(?:about|data|blob):/i.test(raw)) return { nonNetwork: true, url: raw };
  return { nonNetwork: false, url: await assertPublicHttpUrl(raw) };
}

export function redactUrl(input) {
  try {
    const url = input instanceof URL ? new URL(input.toString()) : new URL(String(input));
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return 'invalid://redacted';
  }
}

function boundedNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

export function sanitizeJob(input = {}) {
  const url = normalizePublicHttpUrl(input.url);
  const rawActions = Array.isArray(input.actions) ? input.actions.slice(0, MAX_ACTIONS) : [];
  if (Array.isArray(input.actions) && input.actions.length > MAX_ACTIONS) throw new Error('too_many_actions');

  const actions = rawActions.map((row, index) => {
    const type = String(row?.type || '').trim();
    if (type === 'wait') {
      return { type, ms: boundedNumber(row.ms, 250, 0, 2000) };
    }
    if (type === 'wait_for_selector') {
      const selector = String(row?.selector || '').trim();
      if (!selector || selector.length > MAX_SELECTOR_LENGTH) throw new Error(`invalid_selector_at_${index}`);
      return { type, selector, timeout_ms: boundedNumber(row.timeout_ms, 2000, 100, 5000) };
    }
    if (type === 'scroll') {
      return {
        type,
        x: boundedNumber(row.x, 0, -2000, 2000),
        y: boundedNumber(row.y, 600, -4000, 4000)
      };
    }
    if (type === 'follow_anchor') {
      const selector = String(row?.selector || '').trim();
      if (!selector || selector.length > MAX_SELECTOR_LENGTH) throw new Error(`invalid_anchor_selector_at_${index}`);
      return { type, selector };
    }
    throw new Error(`unsupported_action_at_${index}`);
  });

  return {
    url,
    timeout_ms: boundedNumber(input.timeout_ms, 15000, 1000, 30000),
    viewport: {
      width: boundedNumber(input.viewport?.width, 1280, 320, 1920),
      height: boundedNumber(input.viewport?.height, 720, 240, 1080)
    },
    max_text_chars: boundedNumber(input.max_text_chars, 40000, 1000, 80000),
    include_screenshot: input.include_screenshot === true,
    include_screenshot_base64: input.include_screenshot_base64 === true,
    actions
  };
}
