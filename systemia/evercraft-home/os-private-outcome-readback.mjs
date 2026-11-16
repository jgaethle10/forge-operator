// Private owned-service receipt bridge for Evercraft Home.
// Authenticates one bounded server-to-server readback envelope only.
// Neither HMAC nor the receipt shape proves independently authenticated provider
// settlement, physical Saban execution, customer receipt, or merchant profit.
import fs from "node:fs";
import path from "node:path";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { parseOwnedPaymentUrl } from "../mcp/owned-payment-transport.mjs";
import { reconcileEvercraftOutcomeSource } from "./os-outcome-source-audit.mjs";

export const OUTCOME_READBACK_SCHEMA = "evercraft.home.os-outcome-readback.v1";
const UPSTREAM_SCHEMA = "evercraft.os.private-outcome-source-envelope.v1";
const MAX_BYTES = 256 * 1024;
const MAX_AGE_MS = 120_000;
const ALLOWED_PATH = /^\/internal\/os\/outcomes\/[a-z0-9-]{1,60}$/;

function held(state, detail) {
  return Object.freeze({
    schema: OUTCOME_READBACK_SCHEMA, state, detail,
    bridge_response_authenticated: false,
    source_contracts_structurally_consistent: null,
    reason_codes: [],
    read_at: null,
    payment_issuer_independently_authenticated: false,
    systemia_ledger_independently_authenticated: false,
    execution_ledger_independently_authenticated: false,
    shipping_provider_independently_refetched: false,
    exact_offer_product_verified: false,
    replay_and_side_effects_verified: false,
    worker_result_attested: false,
    customer_delivery_verified: false,
    customer_acceptance_verified: false,
    business_margin_verified: false,
    authority_granted: false,
    mutation_performed: false,
    private_order_data_returned: false,
  });
}

function privateKeyFile(file) {
  if (typeof file !== "string" || !path.isAbsolute(file)) throw Error("private_file_required");
  const parent = path.dirname(file);
  const folder = fs.lstatSync(parent), entry = fs.lstatSync(file);
  if (!folder.isDirectory() || folder.isSymbolicLink() || (folder.mode & 0o077) ||
    !entry.isFile() || entry.isSymbolicLink() || (entry.mode & 0o077) ||
    entry.size < 32 || entry.size > 4096 ||
    fs.realpathSync(file) !== file || fs.realpathSync(parent) !== parent) throw Error("private_file_untrusted");
  const secret = fs.readFileSync(file, "utf8").trim();
  if (Buffer.byteLength(secret, "utf8") < 32 ||
      Buffer.byteLength(secret, "utf8") > 4096 ||
      /[\u0000-\u001f\u007f]/.test(secret)) throw Error("private_file_value_invalid");
  return secret;
}

async function jsonResponseLimited(response) {
  if (response?.status !== 200 || response.ok !== true) throw Error("upstream_unavailable");
  if (!String(response.headers?.get("content-type") || "").toLowerCase().includes("application/json")) throw Error("upstream_type_invalid");
  const length = Number(response.headers.get("content-length") || 0);
  if (!Number.isFinite(length) || length > MAX_BYTES) throw Error("upstream_length_invalid");
  if (!response.body || typeof response.body[Symbol.asyncIterator] !== "function") {
    const value = await response.text();
    if (Buffer.byteLength(value) > MAX_BYTES) throw Error("upstream_oversized");
    return JSON.parse(value);
  }
  const parts = [];
  let used = 0;
  for await (const part of response.body) {
    used += part.length;
    if (used > MAX_BYTES) throw Error("upstream_oversized");
    parts.push(Buffer.from(part));
  }
  return JSON.parse(Buffer.concat(parts).toString("utf8"));
}

function authenticateEnvelope(envelope, nonce, key, now) {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) throw Error("invalid_envelope");
  const { signature, ...body } = envelope;
  if (body.schema !== UPSTREAM_SCHEMA || body.read_action !== "read_latest_os_outcome" ||
    body.nonce !== nonce || body.complete !== true || body.synthetic !== false ||
    typeof body.observed_at !== "string" || Number.isNaN(Date.parse(body.observed_at)) ||
    new Date(body.observed_at).toISOString() !== body.observed_at ||
    Math.abs(now - Date.parse(body.observed_at)) > MAX_AGE_MS ||
    !body.records || typeof body.records !== "object" || Array.isArray(body.records)) throw Error("envelope_contract_invalid");
  if (typeof signature !== "string" || !/^hmac-sha256:[0-9a-f]{64}$/.test(signature)) throw Error("envelope_signature_invalid");
  const expected = createHmac("sha256", key).update(JSON.stringify(body)).digest();
  const observed = Buffer.from(signature.slice("hmac-sha256:".length), "hex");
  if (observed.length !== expected.length || !timingSafeEqual(observed, expected)) throw Error("envelope_signature_invalid");
  return body.records;
}

export function createPrivateOutcomeReadback({
  endpointUrl = "",
  tokenFile = "",
  signatureKeyFile = "",
  fetchImpl = fetch,
  now = () => Date.now(),
  nonceFactory = () => randomBytes(24).toString("hex"),
  timeoutMs = 7_000,
} = {}) {
  if (typeof fetchImpl !== "function" || typeof now !== "function" ||
      typeof nonceFactory !== "function" ||
      !Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 15_000) throw Error("invalid_reader_arguments");
  const empty = ![endpointUrl, tokenFile, signatureKeyFile].some(x => String(x || "").trim());
  let endpoint;
  let configured = false;
  if (!empty) {
    try {
      endpoint = parseOwnedPaymentUrl(endpointUrl, {allowMissing:false});
      if (!endpoint || endpoint.origin !== "https://fabric.systemiacommandcenters.com" ||
          endpoint.search || endpoint.hash || endpoint.port ||
          !ALLOWED_PATH.test(endpoint.pathname) ||
          !tokenFile || !signatureKeyFile || tokenFile === signatureKeyFile) throw Error("private_endpoint_invalid");
      privateKeyFile(tokenFile);
      privateKeyFile(signatureKeyFile);
      configured = true;
    } catch { configured = false; }
  }
  const read = async () => {
    if (!configured) return held(empty ? "not_connected" : "configuration_invalid",
      empty ? "An owned private OS outcome source is not connected. No paid/delivered customer outcome is asserted."
        : "The approved owned endpoint and both private credentials must pass readback configuration.");
    try {
      const token = privateKeyFile(tokenFile);
      const key = privateKeyFile(signatureKeyFile);
      const clock = now();
      const nonce = nonceFactory();
      if (!Number.isFinite(clock) || !/^[a-f0-9]{48}$/.test(nonce)) throw Error("clock_or_nonce_invalid");
      const response = await fetchImpl(endpoint.href, {
        method: "POST", redirect: "error",
        headers: {
          "authorization": "Bearer " + token,
          "accept": "application/json",
          "content-type": "application/json",
          "cache-control": "no-store",
          "user-agent": "Evercraft-OS-Private-Outcome-Readback/1.0",
        },
        body: JSON.stringify({
          schema: "evercraft.os.private-outcome-read-request.v1",
          action: "read_latest_os_outcome", nonce,
          requested_at: new Date(clock).toISOString(),
          max_outcomes: 1,
          response_contract: UPSTREAM_SCHEMA,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const envelope = await jsonResponseLimited(response);
      const records = authenticateEnvelope(envelope, nonce, key, clock);
      const audit = reconcileEvercraftOutcomeSource(records);
      return Object.freeze({
        ...held("authenticated_source_held",
          "An approved private bridge responded, but one or more source receipt contracts could not be reconciled."),
        state: audit.state === "source_consistent_unattested"
          ? "authenticated_source_consistent_unattested"
          : "authenticated_source_held",
        detail: audit.state === "source_consistent_unattested"
          ? "Private bridge envelope authenticated and source receipt shapes reconcile. Independent provider, worker and ledger verification remain unproved."
          : "Authenticated private bridge response contains missing or inconsistent source receipts. No customer fulfillment proof.",
        bridge_response_authenticated: true,
        source_contracts_structurally_consistent: audit.source_contracts_structurally_consistent,
        reason_codes: audit.reason_codes,
        read_at: new Date(clock).toISOString(),
      });
    } catch {
      return held("private_bridge_unverified",
        "The private readback did not return a timely signed envelope from the configured owned source. No transaction or fulfillment claims.");
    }
  };
  return Object.freeze({
    read, configured,
    readiness: Object.freeze({
      schema: "evercraft.home.os-outcome-reader-readiness.v1",
      state: configured ? "configured_unverified" : empty ? "not_connected" : "configuration_invalid",
      read_only: true, browser_upload_allowed: false,
      payment_or_delivery_authority: false,
    }),
  });
}
