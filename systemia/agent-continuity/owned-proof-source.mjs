import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createCommissionedTeamGate } from "./signed-evidence.mjs";

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
      !keys.dispatch_preflight || !keys.dispatch_completion)
    throw new Error("commissioned_trust_keys_invalid");
  for (const folder of ["preflight", "completion", "claimed"]) {
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
