import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);
const roots = [
  '.github/workflows',
  'plugins',
  'mcp-registry',
  'public',
  'systemia'
];
const ignoredPrefixes = [
  'systemia/migrations/',
  'conformance/'
];
const textExtensions = new Set(['.js','.mjs','.cjs','.ts','.tsx','.json','.yml','.yaml','.md','.txt','.sh','.html','.jsonld']);
const forbidden = [
  { key: 'base44_host', re: new RegExp('base44\\.app', 'i') },
  { key: 'base44_env', re: new RegExp('\\bBASE44_[A-Z0-9_]+\\b') },
  { key: 'base44_package', re: new RegExp('@base44\\/', 'i') },
  { key: 'base44_cli', re: new RegExp('\\bbase44\\s+(?:functions|login|deploy|whoami|app)\\b', 'i') }
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const violations = [];
for (const root of roots) {
  for (const full of walk(path.join(repoRoot, root))) {
    const rel = path.relative(repoRoot, full).split(path.sep).join('/');
    if (ignoredPrefixes.some((prefix) => rel.startsWith(prefix))) continue;
    if (!textExtensions.has(path.extname(full).toLowerCase())) continue;
    const content = fs.readFileSync(full, 'utf8');
    const lines = content.split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const rule of forbidden) {
        if (rule.re.test(line)) {
          violations.push({
            path: rel,
            line: index + 1,
            rule: rule.key,
            excerpt: line.trim().slice(0, 260)
          });
        }
      }
    });
  }
}

const unique = [...new Map(violations.map((v) => [`${v.path}:${v.line}:${v.rule}`, v])).values()]
  .sort((a,b) => a.path.localeCompare(b.path) || a.line - b.line);

const report = {
  schema: 'evercraft.systemia.no-base44-runtime-audit.v1',
  operational_roots: roots,
  ignored_historical_prefixes: ignoredPrefixes,
  violation_count: unique.length,
  violations: unique
};
console.log(JSON.stringify(report, null, 2));
if (unique.length) {
  console.error(`NO_BASE44_RUNTIME_FAIL: ${unique.length} operational Base44 reference(s) remain`);
  process.exit(1);
}
console.log('NO_BASE44_RUNTIME_PASS');
