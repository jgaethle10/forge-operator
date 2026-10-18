// Evercraft-owned informational continuity. Never a voteroman.com DNS cutover.
export const ROMAN_ROUTES = Object.freeze({
  evercraft: '/campaigns/roman/',
  backup: 'https://headless-jhpvqnpgxlh-sociallyguud-140c.wix-site-host.com/',
  tertiary: 'https://jgaethle10.github.io/forge-operator/campaigns/roman/',
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
  // Same-process canonical static HTML, no upstream dependency.
  if (validRomanHtml(localHtml)) {
    return { state: 'local_ready', status: 302, location: ROMAN_ROUTES.evercraft };
  }
  // Failover to only these two independently hosted, fixed destinations.
  // Do not use caller-provided URLs, preserve query strings, or send visitor data.
  for (const [label, endpoint] of [['wix',ROMAN_ROUTES.backup],['github_pages',ROMAN_ROUTES.tertiary]]) {
    try {
      const response=await fetchImpl(endpoint,{
        method:'GET',redirect:'error',signal:AbortSignal.timeout(timeoutMs),
        headers:{accept:'text/html'},
      });
      if(response.status!==200 ||
         !(response.headers.get('content-type')||'').toLowerCase().includes('text/html') ||
         Number(response.headers.get('content-length')||0)>MAX_HTML_BYTES)continue;
      const html=await response.text();
      if(!validRomanHtml(html))continue;
      return { state:label+'_independent_backup_ready',status:302,location:endpoint };
    } catch { /* try the next independently hosted information mirror */ }
  }
  return { state:'no_verified_destination',status:503,location:null };
}
