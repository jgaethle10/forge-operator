// Owned, deterministic brand-source drift gate for the existing Human Experience lane.
// Static source is not a rendered-browser receipt and grants no release authority.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DESIGN_PROFILES = Object.freeze([
  {
    id: 'evercraft-headquarters',
    html: 'public/headquarters/index.html',
    styles: 'public/headquarters/tower.css',
    tokens: {
      '--black': '#07090d',
      '--gold': '#b79a56',
      '--ice': '#4fb8ff',
      '--ink': '#f6f5f1'
    },
    skipLink: true
  },
  {
    id: 'work-saban',
    html: 'public/work-saban/index.html',
    styles: null, // Existing Work Saban style is embedded in the page.
    tokens: {
      '--paper': '#ffffff',
      '--surface': '#f8f8f7',
      '--red': '#a4142f',
      '--ink': '#171717'
    },
    skipLink: false
  }
]);

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const asHex6 = value => {
  const v = String(value || '').toLowerCase();
  return /^#[0-9a-f]{3}$/.test(v)
    ? '#' + [...v.slice(1)].map(x => x + x).join('')
    : v;
};

function read(root, relativePath, checks, id) {
  try {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
  } catch {
    checks.push({
      id,
      rule: 'source_available',
      state: 'fail',
      path: relativePath,
      detail: 'Required first-party design source could not be read.'
    });
    return '';
  }
}

function cssRootTokens(styleText) {
  const rootBlock = /:root\s*\{([^}]*)\}/i.exec(styleText)?.[1] || '';
  return Object.fromEntries(
    [...rootBlock.matchAll(/(--[a-z][\w-]*)\s*:\s*(#[\da-f]{3,8})\b/gi)]
      .map(match => [match[1].toLowerCase(), asHex6(match[2])])
  );
}

function record(checks, id, rule, pass, sourcePath, detail) {
  checks.push({ id, rule, state: pass ? 'pass' : 'fail', path: sourcePath, detail });
}

export function checkDesignContract({ rootDir = REPO_ROOT } = {}) {
  const checks = [];
  for (const profile of DESIGN_PROFILES) {
    const html = read(rootDir, profile.html, checks, profile.id);
    const styles = profile.styles ? read(rootDir, profile.styles, checks, profile.id) : html;
    const declared = cssRootTokens(styles);

    for (const [token, expected] of Object.entries(profile.tokens)) {
      record(checks, profile.id, 'brand_token_' + token.slice(2),
        declared[token] === expected,
        profile.styles || profile.html,
        'Expected root declaration ' + token + ': ' + expected + '; found ' + (declared[token] || 'missing') + '.');
    }

    record(checks, profile.id, 'document_language',
      /<html\b[^>]*\blang\s*=\s*["'][^"']+["']/i.test(html),
      profile.html, 'Document declares a language.');
    record(checks, profile.id, 'viewport',
      /<meta\b[^>]*\bname\s*=\s*["']viewport["']/i.test(html),
      profile.html, 'Responsive viewport metadata exists.');
    record(checks, profile.id, 'page_title',
      /<title\b[^>]*>[^<]{2,}<\/title>/i.test(html),
      profile.html, 'Nonempty document title exists.');
    record(checks, profile.id, 'keyboard_focus',
      /:focus-visible\b/.test(styles),
      profile.styles || profile.html, 'Explicit keyboard focus styling exists.');
    if (profile.skipLink) {
      record(checks, profile.id, 'skip_to_content',
        /<a\b[^>]*class=["'][^"']*\bskip-link\b[^"']*["'][^>]*href=["']#main["']/i.test(html) &&
          /<main\b[^>]*id=["']main["']/i.test(html),
        profile.html, 'Skip link points at a real main content element.');
    }
  }
  const failures = checks.filter(c => c.state === 'fail');
  return {
    schema: 'evercraft.design-source-contract.v1',
    inspection: 'static_source_only',
    status: failures.length ? 'source_fail' : 'source_pass',
    release_authority: false,
    rendered_browser_verified: false,
    deployed_site_verified: false,
    summary: {
      profiles: DESIGN_PROFILES.length,
      checks: checks.length,
      failures: failures.length
    },
    checks,
    failures
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkDesignContract();
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (result.status !== 'source_pass') process.exitCode = 1;
}
