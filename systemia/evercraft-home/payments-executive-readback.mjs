// Read-only Evercraft Payments -> Home bridge. Payment authority remains with Evercraft Payments.
// Never infer settlement from checkout links, Stripe redirects, discovery, or synthetic records.
import fs from "node:fs";
import path from "node:path";
import { parseOwnedPaymentUrl } from "../mcp/owned-payment-transport.mjs";

export const EXECUTIVE_PAYMENT_SCHEMA = "evercraft.home.payments-readback.v1";
const UPSTREAM_SCHEMA = "evercraft.payments.executive-paid-orders-snapshot.v1";
const HOUR = 60 * 60 * 1000;
const WINDOW = 7 * 24 * HOUR;
const MAX_ORDERS = 500;
const MAX_RESPONSE_BYTES = 300_000;
const REF = /^[A-Za-z0-9][A-Za-z0-9:._-]{7,255}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,255}$/;
const RECEIPT = /^sha256:[a-f0-9]{64}$/;

function held(state, detail) {
  return {
    schema: EXECUTIVE_PAYMENT_SCHEMA, state, detail,
    source: "evercraft_payments", period: "rolling_seven_days",
    verified_paid_orders: null, gross_settled_cents: null,
    currency: "USD", source_verified_at: null,
    full_period_covered: false, provider_receipts_redacted: true,
    gross_is_not_net_profit: true, order_or_entitlement_created: false,
    payment_execution_performed: false,
  };
}
function validTimestamp(s) {
  return typeof s === "string" && !Number.isNaN(Date.parse(s)) &&
    new Date(s).toISOString() === s;
}
function privateToken(file) {
  if (typeof file !== "string" || !path.isAbsolute(file)) throw Error("token_path_invalid");
  const st = fs.lstatSync(file);
  if (!st.isFile() || st.isSymbolicLink() || (st.mode & 0o077) !== 0 ||
      st.size < 32 || st.size > 4096) throw Error("token_file_not_private");
  const value = fs.readFileSync(file, "utf8").trim();
  if (value.length < 32 || value.length > 4096 || /[\s\x00-\x1f]/.test(value)) {
    throw Error("token_value_invalid");
  }
  return value;
}
async function responseJsonLimited(response) {
  if (!response || !response.ok || response.status !== 200) throw Error("upstream_http_unavailable");
  const contentType = String(response.headers?.get("content-type") || "").toLowerCase();
  if (!contentType.includes("application/json")) throw Error("upstream_content_type_invalid");
  const declared = Number(response.headers?.get("content-length") || 0);
  if (declared > MAX_RESPONSE_BYTES) throw Error("upstream_response_too_large");
  let bytes = 0, payload = "";
  if (!response.body || typeof response.body[Symbol.asyncIterator] !== "function") {
    const value = await response.text();
    if (Buffer.byteLength(value) > MAX_RESPONSE_BYTES) throw Error("upstream_response_too_large");
    return JSON.parse(value);
  }
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > MAX_RESPONSE_BYTES) throw Error("upstream_response_too_large");
    payload += Buffer.from(chunk).toString("utf8");
  }
  return JSON.parse(payload);
}
function validateSnapshot(snapshot, period, nowMs) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot) ||
    snapshot.schema !== UPSTREAM_SCHEMA ||
    snapshot.authority !== "evercraft_payments" ||
    snapshot.provider_boundary !== "raven_nexus" ||
    snapshot.source !== "canonical_order_ledger_and_authoritative_settlement_readback" ||
    snapshot.complete !== true || snapshot.synthetic !== false ||
    snapshot.livemode !== true || snapshot.currency !== "USD" ||
    snapshot.window_start !== period.window_start ||
    snapshot.window_end !== period.window_end ||
    !validTimestamp(snapshot.verified_at) ||
    Math.abs(nowMs - Date.parse(snapshot.verified_at)) > 5 * 60_000 ||
    !RECEIPT.test(String(snapshot.snapshot_receipt_sha256 || "")) ||
    !Array.isArray(snapshot.orders) || snapshot.orders.length > MAX_ORDERS ||
    !Number.isSafeInteger(snapshot.order_count) ||
    snapshot.order_count !== snapshot.orders.length
  ) throw Error("canonical_snapshot_unverified");
  const seenOrders = new Set(), seenReceipts = new Set();
  let cents = 0;
  for (const order of snapshot.orders) {
    if (!order || typeof order !== "object" ||
      !ID.test(String(order.order_key || "")) ||
      !ID.test(String(order.offer_key || "")) ||
      !REF.test(String(order.provider_receipt_id || "")) ||
      order.currency !== "USD" ||
      order.provider_boundary !== "raven_nexus" ||
      order.payment_state !== "paid" ||
      order.provider_paid_verified !== true ||
      order.settlement_verified !== true ||
      order.synthetic !== false || order.livemode !== true ||
      order.refund_state !== "none" || order.dispute_state !== "none" ||
      !Number.isSafeInteger(order.amount_cents) ||
      order.amount_cents <= 0 || order.amount_cents > 100_000_000 ||
      !validTimestamp(order.provider_verified_at) ||
      Math.abs(nowMs - Date.parse(order.provider_verified_at)) > 5 * 60_000 ||
      seenOrders.has(order.order_key) || seenReceipts.has(order.provider_receipt_id)
    ) throw Error("canonical_order_receipt_unverified");
    seenOrders.add(order.order_key);
    seenReceipts.add(order.provider_receipt_id);
    cents += order.amount_cents;
    if (!Number.isSafeInteger(cents)) throw Error("canonical_total_overflow");
  }
  // The backend must attest an exact complete period. Home never sums an incomplete page.
  if (snapshot.gross_settled_cents !== cents) throw Error("canonical_total_mismatch");
  return {
    schema: EXECUTIVE_PAYMENT_SCHEMA,
    state: "verified_settled_snapshot",
    detail: "Complete, fresh, canonical Evercraft Payments attestation for settled, nonrefunded USD orders. Gross receipts are not profit or accounting revenue.",
    source: "evercraft_payments", period: "rolling_seven_days",
    verified_paid_orders: seenOrders.size, gross_settled_cents: cents,
    currency: "USD", source_verified_at: snapshot.verified_at,
    full_period_covered: true, provider_receipts_redacted: true,
    gross_is_not_net_profit: true,
    order_or_entitlement_created: false, payment_execution_performed: false,
  };
}
export function createExecutivePaymentsReader({
  readbackUrl = "",
  authorizationTokenFile = "",
  fetchImpl = fetch,
  now = () => Date.now(),
  timeoutMs = 7_000,
} = {}) {
  if (typeof fetchImpl !== "function" || typeof now !== "function" ||
      !Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 15_000) {
    throw Error("executive_payments_reader_arguments_invalid");
  }
  const missing = !String(readbackUrl || "").trim() && !String(authorizationTokenFile || "").trim();
  let endpoint = null, configured = false;
  if (!missing) {
    try {
      endpoint = parseOwnedPaymentUrl(readbackUrl, { allowMissing:false });
      if (!endpoint || endpoint.search || endpoint.hash || endpoint.port ||
          endpoint.pathname === "/" || !authorizationTokenFile) throw Error("endpoint_invalid");
      // Verify private token file at configuration time; reopen on each read to catch unsafe rotation.
      privateToken(authorizationTokenFile);
      configured = true;
    } catch {
      configured = false;
    }
  }
  const read = async () => {
    if (!configured) {
      return missing ? held("canonical_feed_not_connected",
        "No approved private Evercraft Payments readback endpoint is configured. Paid orders are unknown, not zero.")
        : held("private_readback_configuration_invalid",
          "An owned readback endpoint and private token file must both pass configuration checks.");
    }
    const clock = now();
    if (!Number.isFinite(clock)) return held("canonical_feed_unverified","Invalid observation clock.");
    const period = {
      window_start: new Date(clock-WINDOW).toISOString(),
      window_end: new Date(clock).toISOString(),
    };
    try {
      const token = privateToken(authorizationTokenFile);
      const response = await fetchImpl(endpoint.href, {
        method:"POST", redirect:"error",
        headers:{
          "authorization":"Bearer "+token, "accept":"application/json",
          "content-type":"application/json","cache-control":"no-store",
          "user-agent":"Evercraft-Home-Executive-Payments-Readback/1.0"
        },
        body: JSON.stringify({action:"read_executive_paid_orders", ...period, currency:"USD", max_orders:MAX_ORDERS}),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const snapshot = await responseJsonLimited(response);
      return validateSnapshot(snapshot, period, clock);
    } catch {
      return held("canonical_feed_unverified",
        "Private Evercraft Payments did not return a complete, fresh, matching and authoritative settlement snapshot. No paid total is asserted.");
    }
  };
  return Object.freeze({
    configured,
    read,
    readiness: Object.freeze({
      schema: "evercraft.home.payments-reader-readiness.v1",
      state: configured ? "configured_unverified" : missing ? "not_connected" : "configuration_invalid",
      payments_owner: "evercraft_payments",
      has_automatic_payment_authority: false,
      browser_receipt_or_checkout_trusted: false,
    }),
  });
}
