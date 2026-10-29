import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createCommissionedTeamGate, verifySignedAgentEvidence } from "./signed-evidence.mjs";
import { verifyCommissionedRoster } from "./signed-roster.mjs";

function mustFile(file, description) {
  const resolved = path.resolve(String(file || "").trim());
  if (!String(file || "").trim()) throw new Error(description + "_missing");
  const stat = fs.lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(description + "_not_regular_file");
  if ((stat.mode & 0o077) !== 0) throw new Error(description + "_permissions_too_open");
  if (typeof process.getuid === "function" && stat.uid !== process.getuid())
    throw new Error(description + "_owner_mismatch");
  return resolved;
}
function mustDirectory(dir) {
  const resolved = path.resolve(String(dir || "").trim());
  if (!String(dir || "").trim()) throw new Error("commissioned_evidence_directory_missing");
  const stat = fs.lstatSync(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error("commissioned_evidence_directory_invalid");
  if ((stat.mode & 0o077) !== 0)
    throw new Error("commissioned_evidence_directory_permissions_too_open");
  if (typeof process.getuid === "function" && stat.uid !== process.getuid())
    throw new Error("commissioned_evidence_directory_owner_mismatch");
  return resolved;
}
function evidenceFile(root, folder, requestId) {
  const name = crypto.createHash("sha256").update(String(requestId)).digest("hex") + ".json";
  return path.join(root, folder, name);
}
function readProof(root, folder, requestId) {
  const file = mustFile(evidenceFile(root, folder, requestId), "commissioned_" + folder);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/**
 * First-party-only, filesystem-backed evidence pickup.
 * A separate, independently authorized owned signer must produce signed
 * preflight and writeback receipts. This module never issues signed grants.
 */
export function createOwnedCommissionedTeamGate({
  evidenceDir,
  trustKeysFile,
  now = () => new Date(),
} = {}) {
  const root = mustDirectory(evidenceDir);
  const trustFile = mustFile(trustKeysFile, "commissioned_trust_keys_file");
  const keys = JSON.parse(fs.readFileSync(trustFile, "utf8"));
  if (!keys || typeof keys !== "object" ||
      !keys.dispatch_preflight || !keys.dispatch_completion || !keys.registry_snapshot || !keys.worker_execution)
    throw new Error("commissioned_trust_keys_invalid");
  // A roster must be independently authenticated, not signed by the same
  // private authority as a mission dispatch.
  const registryPublicKeys = Object.values(keys.registry_snapshot);
  const dispatchPublicKeys = Object.values(keys.dispatch_preflight);
  try {
    const fingerprints = (values) => values.map((value) =>
      crypto.createPublicKey(value).export({ type: "spki", format: "der" }).toString("hex")
    );
    const rosterKeys = fingerprints(registryPublicKeys);
    const dispatchKeys = new Set(fingerprints(dispatchPublicKeys));
    const completionKeys = new Set(fingerprints(Object.values(keys.dispatch_completion)));
    const workerEntries = Object.entries(keys.worker_execution);
    const workerKeys = fingerprints(workerEntries.map(([,key]) => key));
    if (!rosterKeys.length || !dispatchKeys.size ||
        rosterKeys.some((key) => dispatchKeys.has(key))) {
      throw new Error("commissioned_registry_and_dispatch_signers_not_independent");
    }
    const upstreamKeys = new Set([...rosterKeys, ...dispatchKeys, ...completionKeys]);
    if (!workerEntries.length ||
        workerEntries.some(([id]) => !id || ["sentinel","juniper"].includes(id.toLowerCase())) ||
        workerKeys.some((value) => upstreamKeys.has(value)) ||
        new Set(workerKeys).size !== workerKeys.length) {
      throw new Error("commissioned_worker_signers_not_independent");
    }
  } catch (error) {
    throw new Error(error?.message === "commissioned_registry_and_dispatch_signers_not_independent"
      ? error.message : "commissioned_trust_keys_invalid");
  }
  for (const folder of ["registry", "preflight", "completion", "worker-execution", "claimed"]) {
    const dir = path.join(root, folder);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { mode: 0o700 });
    mustDirectory(dir);
  }

  const gate = createCommissionedTeamGate({
    trustedKeys: keys,
    now,
    readPreflight: async (request) =>
      readProof(root, "preflight", request.request_id),
    readCompletion: async ({request}) =>
      readProof(root, "completion", request.request_id),
    readWorkerExecution: async ({request, reviewerId}) =>
      readProof(root, "worker-execution", request.request_id + ":" + reviewerId),
    verifyRoster: async ({request, preflightEvidence}) =>
      verifyCommissionedRoster({
        request,
        preflightEvidence,
        rosterEnvelope: readProof(root, "registry", "snapshot"),
        trustedKeys: keys,
        now: now(),
      }),
    consumeNonce: async ({preflight_id, request_id, mission_key, expires_at}) => {
      const canonical = crypto.createHash("sha256")
        .update(JSON.stringify({preflight_id, request_id, mission_key})).digest("hex");
      const file = path.join(root, "claimed", canonical + ".json");
      let fd;
      try {
        fd = fs.openSync(file, "wx", 0o600);
        fs.writeFileSync(fd, JSON.stringify({
          schema: "evercraft.agent-continuity.nonce-claim.v1",
          preflight_id, request_id, mission_key, expires_at,
          claimed_at: now().toISOString(),
        }) + "\n");
        fs.fsyncSync(fd);
      } catch (error) {
        if (error?.code === "EEXIST") return false;
        throw error;
      } finally {
        if (fd !== undefined) fs.closeSync(fd);
      }
      return true;
    },
  });
  return gate;
}

/**
 * First-party verified-evidence writer. The caller MUST independently verify
 * the worker's pinned Ed25519 signature before invoking this transport.
 * This writer does not sign evidence or turn a model output into a worker.
 *
 * An exclusive durable file claim prevents overwrites/replays; the existing
 * commissioned gate consumes this same private worker-execution path.
 */
export function createOwnedCommissionedWorkerProofStore({
  evidenceDir,
  trustKeysFile,
  now = () => new Date(),
} = {}) {
  const root = mustDirectory(evidenceDir);
  const file = mustFile(trustKeysFile, "commissioned_worker_trust_keys");
  const keys = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!keys?.worker_execution || !Object.keys(keys.worker_execution).length)
    throw new Error("commissioned_worker_trust_keys_invalid");
  const folder = path.join(root, "worker-execution");
  if (!fs.existsSync(folder)) fs.mkdirSync(folder, { mode: 0o700 });
  mustDirectory(folder);
  const claimFolder = path.join(root, "claimed-worker");
  if (!fs.existsSync(claimFolder)) fs.mkdirSync(claimFolder, { mode: 0o700 });
  mustDirectory(claimFolder);
  return {
    async claimWorkerDispatch({ request, reviewerId, agentId, preflight }) {
      const requestId = String(request?.request_id || "").trim();
      const role = String(reviewerId || "").trim();
      const identity = String(agentId || "").trim();
      if (!requestId || !role || !identity || !preflight?.allowed ||
          preflight?.reviewer_assignments?.[role] !== identity ||
          !String(preflight?.preflight_id || "").trim() ||
          !/^sha256:[a-f0-9]{64}$/.test(String(preflight?.registry_snapshot_hash || "")))
        return false;
      const claimFile = evidenceFile(root, "claimed-worker", requestId + ":" + role);
      let fd;
      let opened = false;
      try {
        fd = fs.openSync(claimFile, "wx", 0o600);
        opened = true;
        fs.writeFileSync(fd, JSON.stringify({
          schema: "evercraft.agent-continuity.worker-dispatch-claim.v1",
          request_id: requestId,
          reviewer_id: role,
          agent_id: identity,
          preflight_id: preflight.preflight_id,
          registry_snapshot_hash: preflight.registry_snapshot_hash,
          claimed_at: now().toISOString(),
        }) + "\n");
        fs.fsyncSync(fd);
        fs.closeSync(fd);
        fd = undefined;
        const dirfd = fs.openSync(claimFolder, "r");
        try { fs.fsyncSync(dirfd); } finally { fs.closeSync(dirfd); }
        return true;
      } catch {
        if (opened) {
          try { fs.unlinkSync(claimFile); } catch { /* fail closed */ }
        }
        return false;
      } finally {
        if (fd !== undefined) fs.closeSync(fd);
      }
    },
    async readEvidence({ request }) {
      if (!request?.request_id) throw new Error("commissioned_request_id_missing");
      return {
        preflightEnvelope: readProof(root, "preflight", request.request_id),
        rosterEnvelope: readProof(root, "registry", "snapshot"),
      };
    },
    async persistWorkerProof({ request, reviewerId, workerEvidence }) {
      const requestId = String(request?.request_id || "").trim();
      const role = String(reviewerId || "").trim();
      if (!requestId || !role || !workerEvidence ||
          workerEvidence.kind !== "worker_execution" ||
          workerEvidence.payload?.request_id !== requestId ||
          workerEvidence.payload?.reviewer_id !== role ||
          workerEvidence.payload?.agent_id !== workerEvidence.key_id ||
          !verifySignedAgentEvidence({
            envelope: workerEvidence,
            kind: "worker_execution",
            trustedKeys: keys,
            now: now(),
          })) {
        return false;
      }
      const dest = evidenceFile(root, "worker-execution", requestId + ":" + role);
      let fd;
      let opened = false;
      try {
        fd = fs.openSync(dest, "wx", 0o600);
        opened = true;
        fs.writeFileSync(fd, JSON.stringify(workerEvidence) + "\n");
        fs.fsyncSync(fd);
        fs.closeSync(fd);
        fd = undefined;
        // fsync the containing directory to make the new name durable across
        // crash/restart where supported by the owned filesystem.
        const dirfd = fs.openSync(folder, "r");
        try { fs.fsyncSync(dirfd); } finally { fs.closeSync(dirfd); }
        return true;
      } catch {
        // Failed writes must not leave a partial proof that Raven could read.
        // Never remove pre-existing entries (including an EEXIST replay).
        if (opened) {
          try { fs.unlinkSync(dest); } catch { /* fail closed */ }
        }
        return false;
      } finally {
        if (fd !== undefined) fs.closeSync(fd);
      }
    },
  };
}
