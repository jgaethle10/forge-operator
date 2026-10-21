/**
 * Read-only regional HTTP canary for the public Roman campaign site.
 * No authentication, forms, tracking, publication, payments, or DNS writes.
 * A runner observation is not a multi-region availability or cutover receipt.
 */
const HOSTS = new Set(['voteroman.com', 'www.voteroman.com']);
const TARGETS = ['https://voteroman.com/', 'https://www.voteroman.com/'];
const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);
const MAX_HTML_BYTES = 262144;

function safeTarget(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !HOSTS.has(parsed.hostname) || parsed.username || parsed.password || parsed.port) {
    throw new Error('unapproved_site_or_transport');
  }
  if (parsed.search || parsed.hash) throw new Error('query_or_fragment_disallowed');
  return parsed;
}

async function prefix(response) {
  if (!response.body?.getReader) return '';
  const reader = response.body.getReader();
  const parts = [];
  let used = 0;
  try {
    while (used < MAX_HTML_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      const next = value.subarray(0, MAX_HTML_BYTES - used);
      parts.push(next);
      used += next.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return new TextDecoder().decode(Buffer.concat(parts.map(part => Buffer.from(part))));
}

export async function probeRomanUrl(target, { fetchImpl = globalThis.fetch, timeoutMs = 12000 } = {}) {
  let current = safeTarget(target);
  const redirects = [];
  for (let attempt = 0; attempt <= 4; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(current.href, {
        method: 'GET', redirect: 'manual', cache: 'no-store',
        headers: { accept: 'text/html' }, signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (error) {
      return { target, state: 'network_inconclusive', cause: String(error?.cause?.code || error?.name || 'unknown'), redirects };
    }
    const status = response.status;
    if (REDIRECT_CODES.has(status)) {
      const location = response.headers.get('location');
      if (!location) return { target, state: 'redirect_unverified', status, redirects };
      let next;
      try { next = safeTarget(new URL(location, current).href); }
      catch { return { target, state: 'unsafe_or_external_redirect', status, redirects }; }
      redirects.push(next.origin + next.pathname);
      current = next;
      continue;
    }
    if ([401, 402, 403, 429].includes(status)) {
      return { target, state: 'access_restricted_inconclusive', status, redirects };
    }
    if (status >= 500) return { target, state: 'upstream_http_error', status, redirects };
    if (status === 404 || status === 410) return { target, state: 'route_http_error', status, redirects };
    if (status < 200 || status >= 300) return { target, state: 'unexpected_http_status', status, redirects };
    const contentType = response.headers.get('content-type') || '';
    if (!/text\/html/i.test(contentType)) return { target, state: 'non_html_response', status, redirects };
    const html = await prefix(response);
    if (!/<(?:!doctype\s+html|html|body)\b/i.test(html)) {
      return { target, state: 'html_structure_unverified', status, redirects };
    }
    if (!/\broman\b/i.test(html)) {
      return { target, state: 'campaign_identity_unverified', status, redirects };
    }
    return { target, state: 'page_fetched', status, redirects, final_origin: current.origin };
  }
  return { target, state: 'redirect_limit_inconclusive', redirects };
}

export async function checkRomanContinuity(options = {}) {
  const results = await Promise.all(TARGETS.map(target => probeRomanUrl(target, options)));
  const passed = results.filter(result => result.state === 'page_fetched').length;
  return {
    schema: 'evercraft.roman.public-continuity-canary.v1',
    observed_at: new Date().toISOString(),
    classification: passed === results.length ? 'reachable_from_one_runner' : passed ? 'partial_from_one_runner' : 'unverified_from_one_runner',
    independent_multiregion_verified: false,
    live_migration_or_cutover_verified: false,
    results
  };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  checkRomanContinuity().then(report => {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (report.classification !== 'reachable_from_one_runner') process.exitCode = 2;
  }).catch(error => {
    process.stderr.write(`continuity_probe_error:${error?.name || 'unknown'}\n`);
    process.exitCode = 2;
  });
}
