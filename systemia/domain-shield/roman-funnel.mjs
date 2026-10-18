// Evercraft-owned, read-only informational continuity router.
// It NEVER intercepts or changes the original voteroman.com DNS.
export const ROMAN_ROUTES = Object.freeze({
  evercraft: '/campaigns/roman/',
  backup: 'https://headless-jhpvqnpgxlh-sociallyguud-140c.wix-site-host.com/',
  donate: 'https://donate.voteroman.com/',
});
const MARKER = 'Roman Kilinkaridis';
const MAX_HTML_BYTES = 1024 * 1024;

export function validRomanHtml(value) {
  return typeof value === 'string' &&
    Buffer.byteLength(value, 'utf8') <= MAX_HTML_BYTES &&
    value.includes(MARKER) &&
    value.includes(ROMAN_ROUTES.donate) &&
    value.includes('</html>') &&
    !value.includes('[APP UNAVAILABLE]');
}

export async function resolveRomanContinuity({
  localHtml,
  fetchImpl = fetch,
  timeoutMs = 2500,
} = {}) {
  // Local first-party content wins; no outbound HTTP request in normal mode.
  if (validRomanHtml(localHtml)) {
    return {state:'local_ready', status:302, location:ROMAN_ROUTES.evercraft};
  }
  // Narrow, preapproved independent *informational* backup only.
  // Network error, redirect, missing body markers, or 402 must fail closed.
  try {
    const response=await fetchImpl(ROMAN_ROUTES.backup,{
      method:'GET',redirect:'error',signal:AbortSignal.timeout(timeoutMs),
      headers:{accept:'text/html'},
    });
    if(response.status !== 200 ||
       !(response.headers.get('content-type')||'').toLowerCase().includes('text/html') ||
       Number(response.headers.get('content-length')||0)>MAX_HTML_BYTES) {
      return {state:'no_verified_destination',status:503,location:null};
    }
    const html=await response.text();
    if (!validRomanHtml(html)) {
      return {state:'no_verified_destination',status:503,location:null};
    }
    return {state:'independent_backup_ready',status:302,location:ROMAN_ROUTES.backup};
  } catch {
    return {state:'no_verified_destination',status:503,location:null};
  }
}
