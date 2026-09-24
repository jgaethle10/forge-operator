#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = path.join(os.homedir(), ".evercraft", "node-seed");
const STATE = path.join(ROOT, "state.json");
const RECEIPTS = path.join(ROOT, "receipts");
const WORKSPACE = path.join(ROOT, "workspace");
const HOST = process.env.EVERCRAFT_NODE_HOST || "127.0.0.1";
const PORT = Number(process.env.EVERCRAFT_NODE_PORT || 4777);

function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.keys(value).sort().map(k => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
  }
  return JSON.stringify(value);
}
const sha256 = (input) => crypto.createHash("sha256").update(input).digest("hex");
const json = (res, code, body) => {
  const data = JSON.stringify(body);
  res.writeHead(code, { "content-type": "application/json", "content-length": Buffer.byteLength(data) });
  res.end(data);
};
const readBody = (req) => new Promise((resolve, reject) => {
  let s = "";
  req.on("data", c => {
    s += c;
    if (s.length > 128 * 1024) reject(new Error("body too large"));
  });
  req.on("end", () => {
    try { resolve(s ? JSON.parse(s) : {}); } catch (e) { reject(e); }
  });
  req.on("error", reject);
});

if (!fs.existsSync(STATE)) {
  console.error("No Evercraft node state found. Run saban-chromebook-node.mjs first.");
  process.exit(1);
}
fs.mkdirSync(RECEIPTS, { recursive: true, mode: 0o700 });
fs.mkdirSync(WORKSPACE, { recursive: true, mode: 0o700 });
const state = JSON.parse(fs.readFileSync(STATE, "utf8"));
const leases = new Map();

function capacityOffer() {
  const cpus = os.cpus().length;
  const free = os.freemem();
  return {
    schema: "evercraft.capacity.v1",
    nodeId: state.nodeId,
    runtime: "linux_runtime",
    status: "ready",
    limits: {
      cpuLogical: Math.min(1, Math.max(0, cpus - 1)),
      memoryBytes: Math.max(0, Math.min(512 * 1024 * 1024, free - 1024 * 1024 * 1024)),
      diskBytes: 1024 * 1024 * 1024,
      maxLeaseSeconds: 900,
      concurrency: 1
    },
    workloadAllowlist: ["saban.logical-cell.v1", "evercraft.receipt-hash.v1"],
    network: { publicIngress: false, peerIngress: false, adapterBind: HOST }
  };
}

function writeReceipt(kind, body) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const receipt = {
    schema: "evercraft.capacity-adapter-receipt.v1",
    kind,
    nodeId: state.nodeId,
    at: new Date().toISOString(),
    body
  };
  receipt.sha256 = sha256(canonical(receipt));
  const p = path.join(RECEIPTS, `${stamp}-${kind}.json`);
  fs.writeFileSync(p, JSON.stringify(receipt, null, 2) + "\n");
  return { path: p, sha256: receipt.sha256 };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);
    if (req.method === "GET" && url.pathname === "/v1/health") {
      return json(res, 200, { ok: true, nodeId: state.nodeId, protocol: "evercraft.capacity.v1" });
    }
    if (req.method === "GET" && url.pathname === "/v1/capacity") {
      return json(res, 200, capacityOffer());
    }
    if (req.method === "POST" && url.pathname === "/v1/leases") {
      if (leases.size >= 1) return json(res, 409, { error: "capacity_busy" });
      const body = await readBody(req);
      const workloadType = body.workloadType || "saban.logical-cell.v1";
      if (!capacityOffer().workloadAllowlist.includes(workloadType)) {
        return json(res, 403, { error: "workload_not_allowed" });
      }
      const seconds = Math.max(1, Math.min(900, Number(body.seconds || 300)));
      const lease = {
        schema: "evercraft.capacity-lease.v1",
        leaseId: "lease_" + crypto.randomUUID(),
        nodeId: state.nodeId,
        workloadType,
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + seconds * 1000).toISOString(),
        status: "active"
      };
      leases.set(lease.leaseId, lease);
      const receipt = writeReceipt("lease-issued", lease);
      return json(res, 201, { lease, receipt });
    }
    if (req.method === "POST" && url.pathname === "/v1/jobs") {
      const body = await readBody(req);
      const lease = leases.get(body.leaseId);
      if (!lease || lease.status !== "active") return json(res, 404, { error: "active_lease_not_found" });
      if (Date.parse(lease.expiresAt) <= Date.now()) {
        lease.status = "expired";
        return json(res, 410, { error: "lease_expired" });
      }
      if (lease.workloadType !== "saban.logical-cell.v1") return json(res, 403, { error: "unsupported_workload" });

      const iterations = Math.max(1, Math.min(500000, Number(body.iterations || 100000)));
      let accumulator = 0;
      for (let i = 0; i < iterations; i++) accumulator = (accumulator + ((i * 2654435761) >>> 0)) >>> 0;

      const checkpoint = {
        schema: "evercraft.saban-checkpoint.v1",
        leaseId: lease.leaseId,
        nodeId: state.nodeId,
        iterations,
        accumulator,
        completedAt: new Date().toISOString()
      };
      const checkpointPath = path.join(WORKSPACE, lease.leaseId + ".checkpoint.json");
      fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2) + "\n");
      const receipt = writeReceipt("job-completed", {
        leaseId: lease.leaseId,
        workloadType: lease.workloadType,
        checkpointSha256: sha256(canonical(checkpoint)),
        iterations,
        accumulator
      });
      return json(res, 200, { ok: true, checkpoint, checkpointPath, receipt });
    }
    if (req.method === "DELETE" && url.pathname.startsWith("/v1/leases/")) {
      const leaseId = decodeURIComponent(url.pathname.split("/").pop());
      const lease = leases.get(leaseId);
      if (!lease) return json(res, 404, { error: "lease_not_found" });
      lease.status = "released";
      lease.releasedAt = new Date().toISOString();
      leases.delete(leaseId);
      const receipt = writeReceipt("lease-released", lease);
      return json(res, 200, { ok: true, lease, receipt });
    }
    return json(res, 404, { error: "not_found" });
  } catch (e) {
    return json(res, 500, { error: "internal_error", message: e instanceof Error ? e.message : String(e) });
  }
});

async function request(method, route, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers["content-type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(`http://${HOST}:${PORT}${route}`, opts);
  const data = await r.json();
  if (!r.ok) throw new Error(`${method} ${route} -> ${r.status} ${JSON.stringify(data)}`);
  return data;
}

async function selfTest() {
  await new Promise(resolve => server.listen(PORT, HOST, resolve));
  try {
    const health = await request("GET", "/v1/health");
    const capacity = await request("GET", "/v1/capacity");
    const created = await request("POST", "/v1/leases", { workloadType: "saban.logical-cell.v1", seconds: 120 });
    const job = await request("POST", "/v1/jobs", { leaseId: created.lease.leaseId, iterations: 150000 });
    const released = await request("DELETE", `/v1/leases/${encodeURIComponent(created.lease.leaseId)}`);
    console.log("");
    console.log("EVERCRAFT CAPACITY ADAPTER: PASS");
    console.log("Node ID:", health.nodeId);
    console.log("Bind:", `${HOST}:${PORT}`, "(loopback only)");
    console.log("Capacity protocol:", capacity.schema);
    console.log("Lease ID:", created.lease.leaseId);
    console.log("Checkpoint SHA-256:", job.receipt.sha256);
    console.log("Release status:", released.lease.status);
    console.log("");
    console.log("STATUS: physical Chromebook served the real evercraft.capacity.v1 HTTP adapter locally.");
    console.log("NEXT: attach an authenticated outbound transport / Systemia resolver endpoint.");
  } finally {
    server.close();
  }
}

if (process.argv.includes("--self-test")) {
  selfTest().catch(e => {
    console.error("EVERCRAFT CAPACITY ADAPTER: FAIL");
    console.error(e);
    server.close();
    process.exit(1);
  });
} else {
  server.listen(PORT, HOST, () => {
    console.log(`Evercraft capacity adapter listening on http://${HOST}:${PORT}`);
    console.log(`Node ID: ${state.nodeId}`);
    console.log("Loopback-only by default. Ctrl+C to stop.");
  });
}
