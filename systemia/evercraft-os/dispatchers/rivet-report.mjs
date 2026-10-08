import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

function requiredText(value, field) {
  const text = String(value || "").trim();
  if (!text) throw new Error(field + "_required");
  return text;
}

function sha256(value) {
  return "sha256:" + createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex");
}

function readPrivateToken(file) {
  const resolved = path.resolve(requiredText(file, "token_file"));
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) throw new Error("rivet_dispatcher_token_not_file");
  if ((stat.mode & 0o077) !== 0) throw new Error("rivet_dispatcher_token_permissions_too_open");
  const token = fs.readFileSync(resolved, "utf8").trim();
  if (Buffer.byteLength(token, "utf8") < 16) throw new Error("rivet_dispatcher_token_too_short");
  return token;
}

export function createOwnedRivetReportDispatcher({
  serviceUrl,
  tokenFile,
  fetchImpl = fetch
} = {}) {
  const origin = new URL(requiredText(serviceUrl, "service_url"));
  if (!["127.0.0.1", "localhost", "::1"].includes(origin.hostname) && origin.protocol !== "https:") {
    throw new Error("rivet_dispatcher_insecure_nonlocal_origin");
  }

  return {
    specialist_slug: "aliev",

    async execute({ product_key, scope, request } = {}) {
      if (product_key !== "aliev") throw new Error("rivet_dispatcher_product_mismatch");
      if (scope !== "report.generate") throw new Error("rivet_dispatcher_scope_mismatch");

      const token = readPrivateToken(tokenFile);
      const address = requiredText(request?.address, "address");
      const reportType = String(request?.report_type || "preliminary_site_opportunity").trim();

      const response = await fetchImpl(new URL("/v1/reports", origin), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          authorization: "Bearer " + token
        },
        body: JSON.stringify({
          address,
          report_type: reportType
        })
      });

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error("rivet_owned_runtime_http_" + response.status + ":" + String(body?.error || "unknown"));
      }
      if (body?.generation_state !== "ready" || !body?.report_id) {
        throw new Error("rivet_owned_runtime_result_not_ready");
      }

      return {
        state: "completed",
        receipt_ref: "rivet-report:" + body.report_id,
        evidence_refs: [
          body?.report?.sha256 ? "sha256:" + body.report.sha256 : null,
          body?.source_snapshot?.sha256 ? "sha256:" + body.source_snapshot.sha256 : null
        ].filter(Boolean),
        output: {
          schema: "evercraft.os.rivet-dispatch-output.v1",
          report_id: body.report_id,
          generation_state: body.generation_state,
          address: body.address,
          report_type: body?.report?.body?.report_type || reportType,
          decision: body?.report?.body?.decision || null,
          metrics: body?.report?.body?.metrics || null,
          report_sha256: body?.report?.sha256 || null,
          source_snapshot_sha256: body?.source_snapshot?.sha256 || null,
          runtime_verification: body?.verification || null,
          raw_team_token_exposed: false,
          output_hash: sha256({
            report_id: body.report_id,
            report_sha256: body?.report?.sha256 || null,
            source_snapshot_sha256: body?.source_snapshot?.sha256 || null
          })
        }
      };
    }
  };
}
