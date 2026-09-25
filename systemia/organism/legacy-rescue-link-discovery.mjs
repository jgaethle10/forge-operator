function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function stripTags(value) {
  return clean(String(value ?? '').replace(/<[^>]+>/g, ' '));
}

function decode(value) {
  return String(value ?? '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function isPrivateLiteral(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (host === 'localhost' || host === '::1' || host.endsWith('.local')) return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
  const m = host.match(/^172\.(\d+)\./);
  return Boolean(m && Number(m[1]) >= 16 && Number(m[1]) <= 31);
}

export function extractCandidateLinks(html, source = {}) {
  const base = new URL(source.url);
  const terms = (source.link_match_terms || []).map((term) => clean(term).toLowerCase()).filter(Boolean);
  const allowed = new Set(
    (source.allowed_link_hosts || source.allowed_hosts || [base.hostname])
      .map((host) => clean(host).toLowerCase())
      .filter(Boolean)
  );

  const out = [];
  const seen = new Set();
  const re = /<a\b[^>]*href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of String(html || '').matchAll(re)) {
    const rawHref = decode(match[1] || match[2] || match[3] || '');
    if (!rawHref || rawHref.startsWith('#') || /^javascript:/i.test(rawHref) || /^mailto:/i.test(rawHref)) continue;

    let url;
    try { url = new URL(rawHref, base); } catch { continue; }
    if (!['https:','http:'].includes(url.protocol)) continue;
    if (url.protocol !== 'https:') continue;
    if (isPrivateLiteral(url.hostname)) continue;
    if (allowed.size && !allowed.has(url.hostname.toLowerCase())) continue;

    url.hash = '';
    const label = stripTags(decode(match[4] || ''));
    const haystack = `${label} ${url.pathname} ${url.search}`.toLowerCase();
    if (terms.length && !terms.some((term) => haystack.includes(term))) continue;

    const key = url.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ url:key, title:label || key });
    if (out.length >= Math.max(1, Number(source.max_discovered_links || 100))) break;
  }
  return out;
}

export function newCandidateLinks(previousLinks = [], currentLinks = []) {
  const known = new Set((previousLinks || []).map((row) => clean(row?.url || row)).filter(Boolean));
  return (currentLinks || []).filter((row) => !known.has(clean(row?.url)));
}
