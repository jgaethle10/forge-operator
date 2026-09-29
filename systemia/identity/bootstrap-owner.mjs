import fs from "node:fs";
import path from "node:path";
import { EvercraftIdentity } from "./identity.mjs";
import { EvercraftPassport } from "../passport/passport.mjs";

function need(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(name + "_required");
  return value;
}

const identityStateDir = path.resolve(need("EVERCRAFT_IDENTITY_STATE_DIR"));
const passportStateDir = path.resolve(need("EVERCRAFT_PASSPORT_STATE_DIR"));
const passwordFile = path.resolve(need("EVERCRAFT_OWNER_PASSWORD_FILE"));
const authorityReceiptRef = need("EVERCRAFT_OWNER_BOOTSTRAP_AUTHORITY_RECEIPT");
const subjectRef = String(process.env.EVERCRAFT_OWNER_SUBJECT_REF || "user:owner").trim();
const login = String(process.env.EVERCRAFT_OWNER_LOGIN || "owner").trim();
const displayName = String(process.env.EVERCRAFT_OWNER_DISPLAY_NAME || "Owner").trim();

const stat = fs.statSync(passwordFile);
if (!stat.isFile()) throw new Error("owner_password_file_not_regular_file");
if ((stat.mode & 0o077) !== 0) throw new Error("owner_password_file_permissions_too_open");
const password = fs.readFileSync(passwordFile, "utf8").replace(/[\r\n]+$/, "");

const identity = new EvercraftIdentity({ stateDir: identityStateDir });
const bootstrapped = identity.bootstrapOwner({
  subjectRef,
  login,
  displayName,
  password,
  authorityReceiptRef,
});

const passport = new EvercraftPassport({ stateDir: passportStateDir });
const now = new Date();
const ends = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
const grant = passport.issueGrant({
  idempotency_key: "evercraft-home-owner-bootstrap:" + subjectRef,
  subject_ref: subjectRef,
  issuer_ref: "evercraft:identity-authority",
  product: "evercraft-home",
  scopes: [
    "home.read",
    "home.systemia.read",
    "home.systemia.plan",
    "home.yard.read",
    "home.network.read",
    "home.identity.sessions.manage"
  ],
  starts_at: now.toISOString(),
  ends_at: ends.toISOString(),
  max_delegation_depth: 1,
  authority_state: "verified_identity_authority",
  authority_receipt_ref: bootstrapped.receipt.receipt_hash,
  purpose: "owner_access_to_evercraft_home",
});

process.stdout.write(JSON.stringify({
  ok: true,
  schema: "evercraft.identity.owner-bootstrap-result.v1",
  subject_ref: subjectRef,
  login,
  identity_receipt: bootstrapped.receipt.receipt_hash,
  passport_grant_id: grant.grant.grant_id,
  password_file_retention: "delete_after_successful_bootstrap",
}, null, 2) + "\n");
