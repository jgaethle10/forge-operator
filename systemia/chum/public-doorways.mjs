const escapeXml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;'
}[ch]));

export function normalizePublicOrigin(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return url.origin;
  } catch {
    return '';
  }
}

export function absolutizeSitemap(xml, origin) {
  const base = normalizePublicOrigin(origin);
  if (!base) throw new Error('public_origin_required');

  return String(xml || '').replace(/<loc>([^<]+)<\/loc>/g, (_match, rawLocation) => {
    const location = String(rawLocation || '').trim();
    let absolute;
    try {
      absolute = new URL(location, base).toString();
    } catch {
      throw new Error('invalid_sitemap_location');
    }
    return `<loc>${escapeXml(absolute)}</loc>`;
  });
}

export function robotsWithSitemap(robots, origin) {
  const base = normalizePublicOrigin(origin);
  if (!base) throw new Error('public_origin_required');

  const sitemap = new URL('/sitemap.xml', base).toString();
  const lines = String(robots || '')
    .split(/\r?\n/)
    .filter((line) => !/^\s*Sitemap\s*:/i.test(line));

  while (lines.length && lines.at(-1).trim() === '') lines.pop();
  return [...lines, '', `Sitemap: ${sitemap}`, ''].join('\n');
}
