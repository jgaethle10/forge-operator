import fs from "node:fs";
import { createHash } from "node:crypto";

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

export function evercraftOsReceiptHash(value) {
  return "sha256:" + createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(canonical(value)))
    .digest("hex");
}

export function sealEvercraftOsUserSessionBootReceipt(body) {
  if (body?.schema !== "evercraft.os.user-session-boot-receipt.v1") {
    throw new Error("boot_receipt_schema_invalid");
  }
  return {
    ...body,
    receipt_hash: evercraftOsReceiptHash(body)
  };
}

export function verifyEvercraftOsUserSessionBootReceipt(receipt) {
  if (receipt?.schema !== "evercraft.os.user-session-boot-receipt.v1") {
    throw new Error("boot_receipt_schema_invalid");
  }
  const { receipt_hash, ...body } = receipt;
  if (!/^sha256:[a-f0-9]{64}$/.test(String(receipt_hash || ""))) {
    throw new Error("boot_receipt_hash_invalid");
  }
  if (receipt_hash !== evercraftOsReceiptHash(body)) {
    throw new Error("boot_receipt_integrity_mismatch");
  }
  return structuredClone(receipt);
}

export function readEvercraftOsUserSessionBootReceipt(file) {
  const configured = String(file || "").trim();
  if (!configured) throw new Error("boot_receipt_file_required");
  const stat = fs.statSync(configured);
  if (!stat.isFile() || stat.size > 512 * 1024) {
    throw new Error("boot_receipt_file_invalid");
  }
  const receipt = JSON.parse(fs.readFileSync(configured, "utf8"));
  return verifyEvercraftOsUserSessionBootReceipt(receipt);
}
