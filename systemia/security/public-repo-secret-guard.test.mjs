import assert from "node:assert/strict";
import { scanText } from "./public-repo-secret-guard.mjs";

const clean = [
  "ALPACA_TRADING_SECRET=placeholder",
  "OPENAI_API_KEY=" + "$" + "{{ secrets.OPENAI_API_KEY }}",
  "const api_secret = \"example-value-replace-me\";",
  "const hash = \"0123456789abcdef0123456789abcdef\";",
].join("\n");
assert.deepEqual(scanText("clean.txt", clean), []);

const openai = "sk-" + "A".repeat(30);
const github = "ghp_" + "B".repeat(36);
const stripe = "sk_" + "live_" + "C".repeat(24);
const aws = "AKIA" + "D".repeat(16);
const google = "AIza" + "E".repeat(35);
const pem = "-----BEGIN " + "PRIVATE KEY-----";
const alpacaEnv = "ALPACA_TRADING_SECRET=" + "F".repeat(40);
const generic = 'client_secret="' + "G".repeat(36) + '"';

for (const [name, value] of [
  ["openai", openai],
  ["github", github],
  ["stripe", stripe],
  ["aws", aws],
  ["google", google],
  ["pem", pem],
  ["alpaca_env", alpacaEnv],
  ["generic", generic],
]) {
  const findings = scanText(name + ".txt", value);
  assert.ok(findings.length >= 1, name + " should be detected");
  assert.ok(findings.every((row) => !JSON.stringify(row).includes(value)));
}

console.log(JSON.stringify({
  ok: true,
  schema: "evercraft.security.public-repo-secret-guard-proof.v1",
  high_confidence_tokens_detected: true,
  private_key_detected: true,
  sensitive_env_literals_detected: true,
  sanitized_findings_only: true,
  secret_material_echoed: false
}));
