import fs from 'node:fs';
import path from 'node:path';

const FETCH_CACHE = new Map();
const MAX_HTML_BYTES = 450000;
const UI_HOST_RE = /(?:^|\.)base44\.app$/i;

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function safeUrl(value) {
  try { return new URL(String(value || '')); } catch { return null; }
}

export function classifySurface(url) {
  const parsed = safeUrl(url);
  if (!parsed) return 'invalid';
  if (parsed.hostname === 'github.com') return 'documentation';
  if (/\/api\/apps\//.test(parsed.pathname) || /\/functions\//.test(parsed.pathname)) return 'api';
  if (UI_HOST_RE.test(parsed.hostname)) return 'human_ui';
  return 'human_web';
}

function visibleText(html) {
  return clean(
    String(html || '')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
  );
}

function count(html, regex) {
  return [...String(html || '').matchAll(regex)].length;
}

function finding(code, severity, detail, metadata = {}) {
  return { code, severity, detail: clean(detail), metadata };
}

export function analyzeHumanSurfaceHtml({ html = '', url = '', product = {}, role = 'clarity_guard', contentType = 'text/html' } = {}) {
  const findings = [];
  const kind = classifySurface(url);
  const lower = String(html || '').toLowerCase();
  const text = visibleText(html);
  const productKey = clean(product.product_key).toLowerCase();
  const productName = clean(product.name);

  if (!/text\/html/i.test(contentType) || kind === 'api' || kind === 'documentation') {
    return { applicable: false, kind, findings, metrics: { text_chars: text.length } };
  }

  if (role === 'clarity_guard') {
    const hasTitle = /<title\b[^>]*>[^<]{2,}<\/title>/i.test(html);
    if (!hasTitle) findings.push(finding('missing_document_title', 'P2', 'Human-facing page has no useful document title.'));
    if (/\b(lorem ipsum|todo|coming soon|under construction)\b/i.test(text)) {
      findings.push(finding('placeholder_copy_visible', 'P2', 'Placeholder or unfinished copy is visible to humans.'));
    }
    if (/\bundefined\b|\[object object\]/i.test(text)) {
      findings.push(finding('rendered_data_leak', 'P1', 'A raw undefined/object rendering artifact is visible in page text.'));
    }
    const rootShell = /id=["']root["']/i.test(html) && text.length < 80;
    if (rootShell) {
      findings.push(finding('rendered_content_requires_browser', 'BLOCKED', 'Static response is an app shell. Rendered clarity cannot be truthfully graded without the owned browser lane.'));
    }
  }

  if (role === 'brand_guard') {
    if (productKey === 'rivet' && /\bluma\b/i.test(text)) {
      findings.push(finding('legacy_brand_leak', 'P1', 'RIVET surface still exposes retired Luma branding.'));
    }
    if (productName && kind === 'human_ui' && text.length >= 80) {
      const tokens = productName.toLowerCase().split(/[^a-z0-9]+/).filter(x => x.length >= 4);
      const branded = tokens.length === 0 || tokens.some(token => lower.includes(token));
      if (!branded) findings.push(finding('brand_identity_unclear', 'P2', `Expected product identity "${productName}" is not evident in the static human-visible text.`));
    }
    if (/\buntitled\b/i.test(text.slice(0, 1000))) {
      findings.push(finding('untitled_surface_visible', 'P2', 'A human-facing surface still presents an Untitled/default identity.'));
    }
  }

  if (role === 'mobile_guard') {
    if (!/<meta\b[^>]*name=["']viewport["'][^>]*>/i.test(html)) {
      findings.push(finding('mobile_viewport_missing', 'P1', 'Human-facing HTML is missing a viewport meta tag.'));
    }
    const rigidWidths = [...String(html).matchAll(/min-width\s*:\s*(\d{3,4})px/gi)]
      .map(m => Number(m[1]))
      .filter(n => n >= 700);
    if (rigidWidths.length) {
      findings.push(finding('rigid_mobile_width_risk', 'P2', `Found large fixed minimum width values: ${[...new Set(rigidWidths)].slice(0, 6).join(', ')}px.`));
    }
  }

  if (role === 'accessibility_guard') {
    if (!/<html\b[^>]*\blang=["'][^"']+["']/i.test(html)) {
      findings.push(finding('document_language_missing', 'P2', 'HTML document does not declare a language.'));
    }
    const imgCount = count(html, /<img\b/gi);
    const imgAltCount = count(html, /<img\b[^>]*\balt=["'][^"']*["']/gi);
    if (imgCount > imgAltCount) {
      findings.push(finding('image_alt_coverage_gap', 'P2', `${imgCount - imgAltCount} image element(s) lack an alt attribute in the static response.`, { img_count: imgCount, img_with_alt: imgAltCount }));
    }
    const unnamedButtons = count(html, /<button\b[^>]*(?:><\/button>|aria-label=["']\s*["'])/gi);
    if (unnamedButtons) findings.push(finding('unnamed_button_risk', 'P2', `${unnamedButtons} button(s) appear to have no accessible name in static markup.`));
  }

  if (role === 'interaction_guard') {
    const deadHref = count(html, /href=["'](?:#|javascript:void\(0\)|javascript:;)["']/gi);
    if (deadHref) findings.push(finding('dead_link_placeholder', 'P1', `${deadHref} CTA/link target(s) use placeholder javascript/# destinations.`));
    const interactiveCount = count(html, /<(?:a|button|input|select|textarea)\b/gi);
    if (kind === 'human_ui' && text.length >= 120 && interactiveCount === 0) {
      findings.push(finding('no_visible_interaction_path', 'P2', 'App-like human surface exposes no obvious interactive element in static markup.'));
    }
  }

  if (role === 'beauty_guard') {
    if (/\b(application error|internal server error|something went wrong|unexpected error)\b/i.test(text.slice(0, 4000))) {
      findings.push(finding('error_state_visible', 'P1', 'Human-facing page appears to be rendering an error state.'));
    }
    if (/\bdefault title\b|\bmy app\b/i.test(text.slice(0, 1200))) {
      findings.push(finding('default_scaffolding_visible', 'P2', 'Default scaffold identity is still visible.'));
    }
    const rawHexCount = count(text.slice(0, 4000), /#[0-9a-f]{6}\b/gi);
    if (rawHexCount >= 6) findings.push(finding('debug_style_tokens_visible', 'P2', 'Numerous raw style tokens appear in visible page text.'));
  }

  return {
    applicable: true,
    kind,
    findings,
    metrics: {
      text_chars: text.length,
      links: count(html, /<a\b/gi),
      buttons: count(html, /<button\b/gi),
      images: count(html, /<img\b/gi)
    }
  };
}

async function fetchSurface(url) {
  if (FETCH_CACHE.has(url)) return FETCH_CACHE.get(url);
  const promise = (async () => {
    const started = Date.now();
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        headers: {
          accept: 'text/html,application/json,text/plain;q=0.8,*/*;q=0.2',
          'user-agent': 'Evercraft-Saban-Human-Experience/1.0'
        },
        signal: AbortSignal.timeout(12000)
      });
      const body = (await response.text()).slice(0, MAX_HTML_BYTES);
      return {
        ok: response.ok,
        status: response.status,
        final_url: response.url || url,
        content_type: response.headers.get('content-type') || '',
        html: body,
        latency_ms: Date.now() - started,
        error: null
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        final_url: url,
        content_type: '',
        html: '',
        latency_ms: Date.now() - started,
        error: clean(error?.message || error)
      };
    }
  })();
  FETCH_CACHE.set(url, promise);
  return promise;
}

function availabilityFindings(fetchResult) {
  if (!fetchResult.status) return [finding('surface_unreachable', 'P0', `Public human surface could not be reached: ${fetchResult.error || 'network failure'}.`)];
  if ([404, 410].includes(fetchResult.status)) return [finding('surface_missing', 'P0', `Public human surface returned HTTP ${fetchResult.status}.`)];
  if (fetchResult.status >= 500) return [finding('surface_server_failure', 'P1', `Public human surface returned HTTP ${fetchResult.status}.`)];
  if (fetchResult.status >= 400) return [finding('surface_http_failure', 'P1', `Public human surface returned HTTP ${fetchResult.status}.`)];
  if (fetchResult.latency_ms > 8000) return [finding('surface_very_slow', 'P2', `Public human surface took ${fetchResult.latency_ms}ms to respond.`)];
  return [];
}

function loadBrowserCoverage(rootDir) {
  const file = path.join(rootDir, 'artifacts/customer-gauntlet/latest.json');
  try {
    const receipt = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      available: true,
      visual_browser_blocked: Number(receipt?.summary?.visual_browser_blocked || 0),
      sell_now_offers: Number(receipt?.summary?.sell_now_offers || 0),
      generated_at: receipt?.generated_at || null
    };
  } catch {
    return { available: false, visual_browser_blocked: null, sell_now_offers: null, generated_at: null };
  }
}

export async function runAssignment({ assignment }) {
  const item = assignment?.item || {};
  const product = item.raw || {};
  const url = clean(product.canonical_url);
  const base = {
    schema: 'evercraft.human-experience.finding-set.v1',
    agent_id: assignment.agent_id,
    role: assignment.role,
    product_key: clean(product.product_key),
    product_name: clean(product.name),
    url,
    surface_kind: classifySurface(url)
  };

  if (item.kind !== 'product') return { ...base, status: 'not_applicable', findings: [] };
  if (!url) {
    return { ...base, status: 'finding', findings: [finding('human_surface_url_missing', 'P1', 'Public product has no canonical URL to inspect.')] };
  }

  const fetched = await fetchSurface(url);
  let findings = [];
  let analysis = { applicable: false, kind: classifySurface(url), findings: [], metrics: {} };

  if (assignment.role === 'availability_guard') {
    findings = availabilityFindings(fetched);
  } else if (fetched.ok) {
    analysis = analyzeHumanSurfaceHtml({
      html: fetched.html,
      url: fetched.final_url || url,
      product,
      role: assignment.role,
      contentType: fetched.content_type
    });
    findings = analysis.findings;
  } else {
    findings = [finding('inspection_blocked_by_surface_failure', 'BLOCKED', 'Human-experience inspection could not proceed because the public surface did not load.')];
  }

  return {
    ...base,
    status: findings.length ? (findings.some(f => f.severity === 'BLOCKED') ? 'blocked' : 'finding') : 'clean',
    fetch: {
      ok: fetched.ok,
      status: fetched.status,
      final_url: fetched.final_url,
      content_type: fetched.content_type,
      latency_ms: fetched.latency_ms,
      error: fetched.error
    },
    metrics: analysis.metrics,
    findings
  };
}

function severityRank(value) {
  return ({ P0: 0, P1: 1, P2: 2, BLOCKED: 3 }[value] ?? 9);
}

export async function reconcile({ results, rootDir }) {
  const findingMap = new Map();
  const surfaces = new Map();

  for (const row of results || []) {
    if (!row?.product_key) continue;
    if (!surfaces.has(row.product_key)) {
      surfaces.set(row.product_key, {
        product_key: row.product_key,
        product_name: row.product_name,
        url: row.url,
        surface_kind: row.surface_kind,
        http_status: row.fetch?.status ?? null,
        final_url: row.fetch?.final_url || row.url,
        roles_seen: new Set(),
        blocked_roles: new Set()
      });
    }
    const surface = surfaces.get(row.product_key);
    surface.roles_seen.add(row.role);
    if (row.status === 'blocked') surface.blocked_roles.add(row.role);

    for (const f of row.findings || []) {
      const key = [row.product_key, row.role, f.code].join(':');
      if (!findingMap.has(key)) {
        findingMap.set(key, {
          product_key: row.product_key,
          product_name: row.product_name,
          url: row.url,
          role: row.role,
          ...f
        });
      }
    }
  }

  const browser = loadBrowserCoverage(rootDir);
  const findings = [...findingMap.values()].sort((a, b) =>
    severityRank(a.severity) - severityRank(b.severity) ||
    a.product_key.localeCompare(b.product_key) ||
    a.code.localeCompare(b.code)
  );

  if (!browser.available) {
    findings.push({
      product_key: 'portfolio',
      product_name: 'Evercraft public portfolio',
      url: null,
      role: 'browser_receipt_guard',
      code: 'owned_browser_visual_receipt_unavailable',
      severity: 'BLOCKED',
      detail: 'Pixel-level beauty, clipping, focus order, and rendered interaction are not being claimed as passed because the owned customer-gauntlet browser receipt is unavailable.',
      metadata: {}
    });
  } else if (browser.visual_browser_blocked > 0) {
    findings.push({
      product_key: 'portfolio',
      product_name: 'Evercraft public portfolio',
      url: null,
      role: 'browser_receipt_guard',
      code: 'owned_browser_visual_checks_blocked',
      severity: 'BLOCKED',
      detail: `${browser.visual_browser_blocked} sell-now visual/browser paths remain blocked in the latest Customer Gauntlet receipt.`,
      metadata: browser
    });
  }

  const surfaceRows = [...surfaces.values()].map(row => ({
    ...row,
    roles_seen: [...row.roles_seen].sort(),
    blocked_roles: [...row.blocked_roles].sort()
  }));
  const counts = {};
  for (const f of findings) counts[f.severity] = (counts[f.severity] || 0) + 1;

  const receipt = {
    schema: 'evercraft.human-experience.reconciliation.v1',
    status: 'reconciled',
    generated_at: new Date().toISOString(),
    doctrine: {
      human_visible_quality_is_release_work: true,
      blocked_is_never_pass: true,
      static_html_is_not_a_visual_receipt: true,
      owned_browser_lane: 'customer-gauntlet/raven-nexus',
      multiplication: 'saban',
      routing: 'systemia-portfolio-sentinel'
    },
    summary: {
      surfaces: surfaceRows.length,
      findings: findings.length,
      severity_counts: counts,
      browser_receipt_available: browser.available,
      browser_visual_blocked: browser.visual_browser_blocked
    },
    surfaces: surfaceRows,
    findings,
    browser
  };

  const outDir = path.join(rootDir, 'artifacts/human-experience');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'latest.json'), JSON.stringify(receipt, null, 2) + '\n');
  return receipt;
}
