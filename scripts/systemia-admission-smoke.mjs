#!/usr/bin/env node
import crypto from "node:crypto";

const BASE = String(process.argv[2] || "http://127.0.0.1:3000").replace(/\/$/, "");
const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
const publicDer = publicKey.export({ type: "spki", format: "der" });
const nodeId = "evnode_" + crypto.createHash("sha256").update(publicDer).digest("hex").slice(0, 24);

async function post(path, body, token) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = "Bearer " + token;
  const r = await fetch(BASE + path, { method: "POST", headers, body: JSON.stringify(body) });
  const data = await r.json();
  if (!r.ok) throw new Error(`${path} ${r.status} ${JSON.stringify(data)}`);
  return data;
}

const challenge = await post("/api/systemia/network/challenge", { nodeId, publicKeyPem: publicPem });
const signature = crypto.sign(null, Buffer.from(challenge.signaturePayload), privateKey).toString("base64");
const admission = await post("/api/systemia/network/admit", {
  challengeId: challenge.challengeId,
  signature,
  capacityOffer: {
    protocol: "evercraft.capacity.v1",
    nodeId,
    runtime: "ci-smoke",
    workloadAllowlist: ["saban.logical-cell.v1"]
  }
});
const hex64 = "a".repeat(64);
const ack = await post("/api/systemia/network/receipt", {
  leaseId: admission.bootstrapLease.leaseId,
  receiptSha256: hex64,
  checkpointSha256: hex64
}, admission.admissionToken);

if (ack.ok !== true || ack.nodeId !== nodeId) throw new Error("Systemia admission receipt was not accepted");
console.log("SYSTEMIA_ADMISSION_SMOKE_PASS", nodeId);
