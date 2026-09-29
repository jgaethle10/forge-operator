import fs from "node:fs";

const targets = JSON.parse(fs.readFileSync(new URL("../distribution/directory-expansion-targets.json", import.meta.url), "utf8"));
const packets = JSON.parse(fs.readFileSync(new URL("../distribution/directory-submission-packets.json", import.meta.url), "utf8"));
const execution = JSON.parse(fs.readFileSync(new URL("../distribution/evercraft-owned-execution-policy.json", import.meta.url), "utf8"));

const fail = (m) => { throw new Error(m); };
if (!Array.isArray(targets.targets) || targets.targets.length < 10) fail("directory target ledger unexpectedly small");

const names = new Set();
for (const t of targets.targets) {
  if (!t.destination || names.has(t.destination)) fail(`duplicate or missing destination: ${t.destination}`);
  names.add(t.destination);
  if (!["P0","P1","P2","P3"].includes(t.priority)) fail(`invalid priority for ${t.destination}`);
  if (t.submission_url !== null && !String(t.submission_url).startsWith("https://")) fail(`non-HTTPS target URL for ${t.destination}`);
  if (/verified_live/.test(t.state) && !t.evidence_url) fail(`verified target lacks evidence URL: ${t.destination}`);
}

if (targets.universal_registry_name !== packets.universal.registry_name) fail("universal registry name drift");
if (targets.universal_endpoint !== packets.universal.endpoint) fail("universal endpoint drift");

const packetNames = new Set([packets.universal.registry_name]);
for (const p of packets.specialists) {
  if (!p.registry_name?.startsWith("io.github.jgaethle10/")) fail(`unexpected registry namespace: ${p.registry_name}`);
  if (!p.endpoint?.startsWith("https://")) fail(`specialist endpoint is not HTTPS: ${p.slug}`);
  if (packetNames.has(p.registry_name)) fail(`duplicate registry name: ${p.registry_name}`);
  packetNames.add(p.registry_name);
}

const forbiddenClaims = ["provider_approved","payment_verified","recommended_by_openai"];
const haystack = JSON.stringify({targets,packets,execution}).toLowerCase();
for (const claim of forbiddenClaims) if (haystack.includes(claim)) fail(`forbidden unsupported claim token found: ${claim}`);

if (execution.rule !== "Evercraft-owned execution first") fail("Evercraft-owned execution policy missing");
if (!execution.primary_tools?.some((x) => x.system === "Evercraft Web")) fail("Evercraft Web is not the primary public fetch lane");
if (!execution.primary_tools?.some((x) => x.system === "Evercraft Browser Worker")) fail("Evercraft Browser Worker is not the primary browser lane");
if (!execution.prohibited_default_dependencies?.includes("TinyFish")) fail("TinyFish must be explicitly forbidden as a default execution dependency");
if (!/Do not silently replace/.test(execution.fallback_policy || "")) fail("fallback policy must fail closed instead of silently substituting external browser tooling");

console.log(`directory expansion valid: ${targets.targets.length} targets, ${packets.specialists.length + 1} submission packets`);
