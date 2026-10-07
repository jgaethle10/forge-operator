import { readFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

function normalize(value) {
  return String(value || '')
    .replaceAll('\\', '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

function assertRelativeConfigPath(value, label) {
  const normalized = normalize(value);
  if (
    !normalized ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.includes('/../')
  ) {
    throw new Error(`${label} must stay inside the Lineage workspace`);
  }
  return normalized;
}

function escapeRegex(char) {
  return /[|\\{}()[\]^$+?.]/.test(char) ? `\\${char}` : char;
}

function globBody(pattern) {
  let out = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i];
    if (char === '*') {
      if (pattern[i + 1] === '*') {
        while (pattern[i + 1] === '*') i += 1;
        out += '.*';
      } else {
        out += '[^/]*';
      }
      continue;
    }
    if (char === '?') {
      out += '[^/]';
      continue;
    }
    out += escapeRegex(char);
  }
  return out;
}

export function compileLineageGlob(rawPattern) {
  let raw = String(rawPattern || '').trim();
  if (!raw) throw new Error('Lineage ignore pattern cannot be empty');

  let negated = false;
  if (raw.startsWith('!')) {
    negated = true;
    raw = raw.slice(1);
  }

  if (!raw) throw new Error('Lineage ignore negation requires a pattern');

  const directoryOnly = raw.endsWith('/');
  const anchored = raw.startsWith('/');
  raw = raw.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!raw) throw new Error('Lineage ignore pattern cannot target repository root');

  const hasSlash = raw.includes('/');
  const body = globBody(raw);
  const prefix = anchored || hasSlash ? '^' : '(?:^|/)';
  const suffix = directoryOnly ? '(?:/.*)?$' : '$';

  return {
    raw: String(rawPattern),
    pattern: raw,
    negated,
    directory_only: directoryOnly,
    regex: new RegExp(prefix + body + suffix),
    matches(path, { isDirectory = false } = {}) {
      const normalized = normalize(path);
      if (directoryOnly && !isDirectory && normalized === raw) return false;
      return this.regex.test(normalized);
    },
  };
}

function parseIgnoreFile(text) {
  const rules = [];
  for (const sourceLine of String(text || '').split(/\r?\n/)) {
    const line = sourceLine.trim();
    if (!line || line.startsWith('#')) continue;
    rules.push(compileLineageGlob(line));
  }
  return rules;
}

const SAFE_ENV_BASENAMES = new Set([
  '.env.example',
  '.env.sample',
  '.env.template',
  '.env.defaults',
]);

const EXACT_SENSITIVE_BASENAMES = new Set([
  '.env',
  '.npmrc',
  '.pypirc',
  '.netrc',
  'id_rsa',
  'id_dsa',
  'id_ecdsa',
  'id_ed25519',
  'credentials.json',
  'service-account.json',
  'secrets.json',
  'secrets.yaml',
  'secrets.yml',
]);

export function sensitivePathReason(path) {
  const normalized = normalize(path);
  const name = basename(normalized).toLowerCase();

  if (SAFE_ENV_BASENAMES.has(name)) return null;
  if (name.startsWith('.env.')) return 'environment_credentials';
  if (EXACT_SENSITIVE_BASENAMES.has(name)) return 'credential_filename';
  if (/^service-account[-_.].*\.json$/i.test(name)) {
    return 'service_account_credentials';
  }
  if (/\.(?:pem|key|p12|pfx)$/i.test(name)) {
    return 'private_key_material';
  }
  return null;
}

export class LineageIgnorePolicy {
  constructor({
    ignoreFile = '.lineageignore',
    rules = [],
    allowSensitivePaths = [],
  } = {}) {
    this.ignoreFile = assertRelativeConfigPath(
      ignoreFile || '.lineageignore',
      'ignoreFile'
    );
    this.rules = rules;
    this.hasNegatedRules = rules.some((rule) => rule.negated);
    this.sensitiveAllows = (allowSensitivePaths || [])
      .map((pattern) => compileLineageGlob(pattern));
    if (this.sensitiveAllows.some((rule) => rule.negated)) {
      throw new Error('Sensitive-path allow rules cannot be negated');
    }
  }

  shouldIgnore(path, { isDirectory = false } = {}) {
    const normalized = normalize(path);
    if (!normalized) return false;
    if (normalized === this.ignoreFile) return false;

    let ignored = false;
    for (const rule of this.rules) {
      if (rule.matches(normalized, { isDirectory })) {
        ignored = !rule.negated;
      }
    }
    return ignored;
  }

  sensitiveReason(path) {
    return sensitivePathReason(path);
  }

  allowsSensitive(path) {
    const normalized = normalize(path);
    return this.sensitiveAllows.some((rule) =>
      rule.matches(normalized, { isDirectory: false })
    );
  }

  summary() {
    return {
      schema: 'evercraft.lineage.ignore-policy.v1',
      ignore_file: this.ignoreFile,
      ignore_rules: this.rules.length,
      sensitive_allow_rules: this.sensitiveAllows.length,
      has_negated_rules: this.hasNegatedRules,
    };
  }
}

export async function loadLineageIgnorePolicy(root, {
  ignoreFile = '.lineageignore',
  extraPatterns = [],
  allowSensitivePaths = [],
} = {}) {
  const normalizedIgnoreFile = assertRelativeConfigPath(
    ignoreFile || '.lineageignore',
    'ignoreFile'
  );
  let fileRules = [];
  let ignoreFilePresent = false;

  try {
    const text = await readFile(
      join(resolve(root), ...normalizedIgnoreFile.split('/')),
      'utf8'
    );
    fileRules = parseIgnoreFile(text);
    ignoreFilePresent = true;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const extraRules = (extraPatterns || []).map((pattern) =>
    compileLineageGlob(pattern)
  );
  const policy = new LineageIgnorePolicy({
    ignoreFile: normalizedIgnoreFile,
    rules: [...fileRules, ...extraRules],
    allowSensitivePaths,
  });

  return {
    policy,
    ignore_file_present: ignoreFilePresent,
    ignore_patterns: [...(extraPatterns || [])].map(String),
    allow_sensitive_paths: [...(allowSensitivePaths || [])].map(String),
    ...policy.summary(),
  };
}

export const lineageIgnore = {
  compile: compileLineageGlob,
  sensitivePathReason,
};
