import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HIGH_CONFIDENCE_PATTERNS = Object.freeze([
  ["private_key_pem", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g],
  ["openai_secret_key", /\bsk-[A-Za-z0-9_-]{24,}\b/g],
  ["github_token", /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g],
  ["stripe_live_secret", /\bsk_live_[A-Za-z0-9]{16,}\b/g],
  ["slack_token", /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g],
  ["aws_access_key_id", /\bAKIA[0-9A-Z]{16}\b/g],
  ["google_api_key", /\bAIza[0-9A-Za-z_-]{35}\b/g],
]);

const SENSITIVE_ENV_NAMES = new Set([
  "ALPACA_TRADING",
  "ALPACA_TRADING_SECRET",
  "ALPACA_API_KEY_ID",
  "ALPACA_API_SECRET_KEY",
  "APCA_API_KEY_ID",
  "APCA_API_SECRET_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "STRIPE_SECRET_KEY",
  "GITHUB_TOKEN",
  "GH_TOKEN",
  "FIREBASE_PRIVATE_KEY",
  "GOOGLE_APPLICATION_CREDENTIALS_JSON",
]);

const SAFE_LITERAL = /(example|placeholder|replace|your[_-]?|test|fake|dummy|proof|changeme|redacted|masked|not[_-]?a[_-]?secret|<[^>]+>|\$\{\{|secrets\.)/i;

function lineNumber(text, index) {
  return text.slice(0, index).split("\n").length;
}

function reportFinding(findings, file, rule, index, text) {
  findings.push({
    file,
    rule,
    line: lineNumber(text, index),
  });
}

export function scanText(file, text) {
  const findings = [];
  const input = String(text || "");

  for (const [rule, regex] of HIGH_CONFIDENCE_PATTERNS) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(input))) {
      if (SAFE_LITERAL.test(match[0])) continue;
      reportFinding(findings, file, rule, match.index, input);
    }
  }

  const envRegex = /^\s*([A-Z][A-Z0-9_]{2,})\s*=\s*["']?([^"'\s#]{12,})["']?\s*(?:#.*)?$/gm;
  let envMatch;
  while ((envMatch = envRegex.exec(input))) {
    const [, name, value] = envMatch;
    if (!SENSITIVE_ENV_NAMES.has(name)) continue;
    if (SAFE_LITERAL.test(value)) continue;
    reportFinding(findings, file, "literal_sensitive_env_assignment", envMatch.index, input);
  }

  const objectRegex = /\b(api[_-]?secret|client[_-]?secret|access[_-]?token|refresh[_-]?token|password)\b\s*[:=]\s*["']([^"'\r\n]{20,})["']/gim;
  let objectMatch;
  while ((objectMatch = objectRegex.exec(input))) {
    const value = objectMatch[2];
    if (SAFE_LITERAL.test(value)) continue;
    if (/^[a-f0-9]{32,}$/i.test(value)) continue;
    reportFinding(findings, file, "literal_secret_assignment", objectMatch.index, input);
  }

  return findings;
}

function isProbablyText(file) {
  const ext = path.extname(file).toLowerCase();
  const binary = new Set([
    ".png",".jpg",".jpeg",".gif",".webp",".ico",".pdf",".zip",".gz",".tar",
    ".woff",".woff2",".ttf",".otf",".mp3",".mp4",".mov",".avi",".sqlite",".db"
  ]);
  return !binary.has(ext);
}

export function scanTrackedFiles({ cwd = process.cwd(), files = null } = {}) {
  const tracked = files || execFileSync("git", ["ls-files", "-z"], {
    cwd,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  }).split("\0").filter(Boolean);

  const findings = [];
  let scanned = 0;
  for (const relative of tracked) {
    if (!isProbablyText(relative)) continue;
    const absolute = path.join(cwd, relative);
    let stat;
    try { stat = fs.statSync(absolute); } catch { continue; }
    if (!stat.isFile() || stat.size > 2 * 1024 * 1024) continue;
    let text;
    try { text = fs.readFileSync(absolute, "utf8"); } catch { continue; }
    scanned += 1;
    findings.push(...scanText(relative, text));
  }
  return { scanned_files: scanned, findings };
}

function main() {
  const result = scanTrackedFiles();
  const receipt = {
    ok: result.findings.length === 0,
    schema: "evercraft.security.public-repo-secret-guard.v1",
    scanned_files: result.scanned_files,
    finding_count: result.findings.length,
    findings: result.findings,
    secret_material_echoed: false,
  };
  console.log(JSON.stringify(receipt, null, 2));
  if (result.findings.length) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
