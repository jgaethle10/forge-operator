#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = path.join(os.homedir(), ".evercraft", "node-seed");
const STATE = path.join(ROOT, "state.json");
const KEY_PRIV = path.join(ROOT, "node-ed25519-private.pem");
const KEY_PUB = path.join(ROOT, "node-ed25519-public.pem");
const RECEIPTS = path.join(ROOT, "receipts");
const BASE = String(process.env.SYSTEMIA_ADMISSION_URL || process.argv[2] || "").replace(/\/$/, "");

function fail(msg) {
  console.error("SYSTEMIA REMOTE ADMISSION: FAIL");
  console.error(msg);
  process.exit(1);
}
function sha256(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}
function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.keys(value).sort().map(k => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
  }
  return JSON.stringify(value);
}
async function post(route, body, token) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = "Bearer " + token;
  const r = await fetch(BASE + route, { method: "POST", headers, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${route} -> ${r.status} ${JSON.stringify(data)}`);
  return data;
}
function capacityOffer(nodeId) {
  const free = os.freemem();
  return {
    protocol: "evercraft.capacity.v1",
    nodeId,
    runtime: "linux_runtime",
    platform: os.platform() + "/" + os.arch(),
    capacity: {
      cpuLogical: Math.min(1, Math.max(0, os.cpus().length - 1)),
      memoryBytes: Math.max(0, Math.min(512 * 1024 * 1024, free - 1024 * 1024 * 1024))
    },
    limits: {
      concurrency: 1,
      maxLeaseSeconds: 900,
      publicIngress: false,
      peerIngress: false
    },
    workloadAllowlist: ["saban.logical-cell.v1"]
  };
}

if (!BASE) fail("Pass the live Systemia base URL, e.g. node systemia-remote-admit.mjs https://your-systemia-host");
if (!/^https:\/\//i.test(BASE) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(BASE)) {
  fail("Remote admission requires HTTPS. Plain HTTP is allowed only for localhost.");
}
for (const p of [STATE, KEY_PRIV, KEY_PUB]) if (!fs.existsSync(p)) fail("Missing node identity. Run the Chromebook node bootstrap first.");

fs.mkdirSync(RECEIPTS, { recursive: true, mode: 0o700 });
const state = JSON.parse(fs.readFileSync(STATE, "utf8"));
const privatePem = fs.readFileSync(KEY_PRIV, "utf8");
const publicPem = fs.readFileSync(KEY_PUB, "utf8");

try {
  const challenge = await post("/api/systemia/network/challenge", {
    nodeId: state.nodeId,
    publicKeyPem: publicPem
  });

  const signature = crypto.sign(
    null,
    Buffer.from(challenge.signaturePayload),
    privatePem
  ).toString("base64");

  const admission = await post("/api/systemia/network/admit", {
    challengeId: challenge.challengeId,
    signature,
    capacityOffer: capacityOffer(state.nodeId)
  });

  const token = admission.admissionToken;
  const lease = admission.bootstrapLease;
  if (!lease || lease.workloadType !== "saban.logical-cell.v1") fail("Systemia did not return the expected bounded bootstrap lease");
  if (Date.parse(lease.expiresAt) <= Date.now()) fail("Systemia returned an expired lease");

  const iterations = Math.max(1, Math.min(500000, Number(lease.iterations || 0)));
  let accumulator = 0;
  for (let i = 0; i < iterations; i++) {
    accumulator = (accumulator + ((i * 2654435761) >>> 0)) >>> 0;
  }

  const checkpoint = {
    schema: "evercraft.saban-checkpoint.v1",
    nodeId: state.nodeId,
    leaseId: lease.leaseId,
    completedIterations: iterations,
    accumulator,
    completedAt: new Date().toISOString()
  };
  const checkpointSha256 = sha256(canonical(checkpoint));

  const localReceipt = {
    schema: "evercraft.systemia.remote-execution-receipt.v1",
    nodeId: state.nodeId,
    leaseId: lease.leaseId,
    systemiaBase: BASE,
    challengeId: challenge.challengeId,
    checkpoint,
    checkpointSha256,
    completedAt: new Date().toISOString()
  };
  localReceipt.receiptSha256 = sha256(canonical(localReceipt));

  const ack = await post("/api/systemia/network/receipt", {
    leaseId: lease.leaseId,
    receiptSha256: localReceipt.receiptSha256,
    checkpointSha256
  }, token);

  const out = path.join(RECEIPTS, new Date().toISOString().replace(/[:.]/g, "-") + "-systemia-remote-admission.json");
  fs.writeFileSync(out, JSON.stringify({ ...localReceipt, systemiaAck: ack }, null, 2) + "\n");

  console.log("");
  console.log("SYSTEMIA REMOTE ADMISSION: PASS");
  console.log("Node ID:", state.nodeId);
  console.log("Systemia:", BASE);
  console.log("Lease ID:", lease.leaseId);
  console.log("Workload:", lease.workloadType);
  console.log("Iterations:", iterations);
  console.log("Receipt accepted:", ack.ok === true ? "YES" : "NO");
  console.log("Local receipt:", out);
  console.log("");
  console.log("STATUS: Systemia challenged the Chromebook, verified its identity, issued a bounded remote lease, and accepted the execution receipt.");
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
}
