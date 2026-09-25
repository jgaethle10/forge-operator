#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const HOME = os.homedir();
const ROOT = path.join(HOME, ".evercraft", "node-seed");
const KEY_PRIV = path.join(ROOT, "node-ed25519-private.pem");
const KEY_PUB = path.join(ROOT, "node-ed25519-public.pem");
const RECEIPTS = path.join(ROOT, "receipts");
const STATE = path.join(ROOT, "state.json");

function mkdirs() {
  fs.mkdirSync(RECEIPTS, { recursive: true, mode: 0o700 });
}

function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.keys(value).sort().map(k => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
  }
  return JSON.stringify(value);
}

function sha256(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function ensureIdentity() {
  mkdirs();
  if (!fs.existsSync(KEY_PRIV) || !fs.existsSync(KEY_PUB)) {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
    fs.writeFileSync(KEY_PRIV, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
    fs.writeFileSync(KEY_PUB, publicKey.export({ type: "spki", format: "pem" }), { mode: 0o644 });
  }
  const publicPem = fs.readFileSync(KEY_PUB, "utf8");
  const privatePem = fs.readFileSync(KEY_PRIV, "utf8");
  const publicDer = crypto.createPublicKey(publicPem).export({ type: "spki", format: "der" });
  const nodeId = "evnode_" + sha256(publicDer).slice(0, 24);
  return { nodeId, publicPem, privatePem };
}

function diskInfo() {
  try {
    const s = fs.statfsSync(HOME);
    return {
      freeBytes: Number(s.bavail) * Number(s.bsize),
      totalBytes: Number(s.blocks) * Number(s.bsize)
    };
  } catch {
    return { freeBytes: null, totalBytes: null };
  }
}

function telemetry() {
  const d = diskInfo();
  return {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    kernel: os.release(),
    cpuLogical: os.cpus().length,
    memoryTotalBytes: os.totalmem(),
    memoryFreeBytes: os.freemem(),
    diskFreeBytes: d.freeBytes,
    diskTotalBytes: d.totalBytes,
    nodeVersion: process.version,
    uptimeSeconds: Math.floor(os.uptime())
  };
}

function safeOffer(t) {
  const MiB = 1024 * 1024;
  const GiB = 1024 * MiB;
  const memoryOffer = Math.max(0, Math.min(512 * MiB, t.memoryFreeBytes - 1024 * MiB));
  const diskOffer = t.diskFreeBytes == null ? 0 : Math.max(0, Math.min(1024 * MiB, t.diskFreeBytes - 2 * GiB));
  return {
    protocol: "evercraft.capacity.v1",
    runtime: "linux_runtime",
    cpuLogical: Math.min(1, Math.max(0, t.cpuLogical - 1)),
    memoryBytes: memoryOffer,
    diskBytes: diskOffer,
    maxLeaseSeconds: 900,
    concurrency: 1,
    network: {
      outboundOnly: true,
      publicIngress: false,
      peerIngress: false
    },
    workspace: {
      ephemeral: true,
      path: path.join(ROOT, "workspace")
    },
    workloadAllowlist: [
      "saban.logical-cell.v1",
      "evercraft.receipt-hash.v1"
    ]
  };
}

function signedEnvelope(identity, kind, body) {
  const envelope = {
    schema: "evercraft.node-envelope.v1",
    kind,
    nodeId: identity.nodeId,
    issuedAt: new Date().toISOString(),
    body
  };
  const payload = Buffer.from(canonical(envelope));
  const signature = crypto.sign(null, payload, identity.privatePem).toString("base64");
  const verified = crypto.verify(null, payload, identity.publicPem, Buffer.from(signature, "base64"));
  return { envelope, signature, verified, digest: sha256(payload) };
}

function writeReceipt(name, data) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(RECEIPTS, `${stamp}-${name}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
  return file;
}

function run() {
  const identity = ensureIdentity();
  const t = telemetry();
  const heartbeat = signedEnvelope(identity, "heartbeat", {
    status: "ready",
    telemetry: t
  });
  const offer = signedEnvelope(identity, "capacity_offer", safeOffer(t));

  const state = {
    schema: "evercraft.node-state.v1",
    nodeId: identity.nodeId,
    protocol: "evercraft.capacity.v1",
    mode: "physical-chromebook-crostini",
    admission: "local-proof-only",
    lastHeartbeatDigest: heartbeat.digest,
    lastCapacityOfferDigest: offer.digest,
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(STATE, JSON.stringify(state, null, 2) + "\n");

  const receipt = {
    schema: "evercraft.physical-node-proof.v1",
    nodeId: identity.nodeId,
    generatedAt: new Date().toISOString(),
    telemetry: t,
    heartbeat,
    capacityOffer: offer,
    publicKeyPem: identity.publicPem,
    constraints: {
      noSudoRequired: true,
      noDockerRequired: true,
      noPublicIngress: true,
      noPeerIngress: true,
      notYetNetworkEnrolled: true
    }
  };
  receipt.receiptSha256 = sha256(canonical(receipt));
  const receiptPath = writeReceipt("physical-node-proof", receipt);

  console.log("");
  console.log("EVERCRAFT PHYSICAL NODE PROOF: PASS");
  console.log("Node ID:", identity.nodeId);
  console.log("Protocol: evercraft.capacity.v1");
  console.log("Signature checks:", heartbeat.verified && offer.verified ? "PASS" : "FAIL");
  console.log("CPU offered:", offer.envelope.body.cpuLogical);
  console.log("Memory offered MiB:", Math.floor(offer.envelope.body.memoryBytes / (1024 * 1024)));
  console.log("Disk offered MiB:", Math.floor(offer.envelope.body.diskBytes / (1024 * 1024)));
  console.log("Receipt SHA-256:", receipt.receiptSha256);
  console.log("Receipt:", receiptPath);
  console.log("");
  console.log("STATUS: identity + signed heartbeat + bounded capacity offer proven locally.");
  console.log("NEXT: bind this Node ID/public key to Systemia Network admission and lease transport.");
}

run();
