import fs from "node:fs";
import path from "node:path";
import { createHash, createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";

const SESSION_SCHEMA = "evercraft.identity.session.v1";
const IDENTITY_SCHEMA = "evercraft.identity.subject.v1";
const SCRYPT = Object.freeze({ N: 32768, r: 8, p: 1, keylen: 64, maxmem: 64 * 1024 * 1024 });
const TRUSTED_PROVISION_AUTHORITY_STATES = new Set(["challenge_verified", "operator_authorized", "migration_verified"]);
const TRUSTED_PASSWORD_AUTHORITY_STATES = new Set(["challenge_verified", "operator_authorized", "migration_verified"]);
const TRUSTED_PROFILE_AUTHORITY_STATES = new Set(["authenticated_self", "operator_authorized", "migration_verified"]);

const sha256 = (value) =>
  "sha256:" + createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex");

function required(value, field) {
  const text = String(value || "").trim();
  if (!text) throw new Error(field + "_required");
  return text;
}

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = file + "." + process.pid + "." + randomBytes(4).toString("hex") + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function safeLogin(value) {
  const login = required(value, "login").toLowerCase();
  if (login.length > 254 || /[\s\u0000-\u001f\u007f]/.test(login)) throw new Error("login_invalid");
  const username = /^[a-z0-9][a-z0-9._-]{2,63}$/.test(login);
  const email = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?\.[a-z]{2,63}$/.test(login);
  if (!username && !email) throw new Error("login_invalid");
  return login;
}

function validatePassword(password) {
  const value = String(password || "");
  if (value.length < 14) throw new Error("password_too_short");
  if (value.length > 512) throw new Error("password_too_long");
  return value;
}

function passwordDigest(password, salt) {
  return scryptSync(password, salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    maxmem: SCRYPT.maxmem,
  });
}

function receipt(body) {
  return { ...body, receipt_hash: sha256(body) };
}

export class EvercraftIdentity {
  constructor({ stateDir, issuerRef = "evercraft:identity-authority" } = {}) {
    if (!stateDir) throw new Error("identity_state_dir_required");
    this.stateDir = path.resolve(stateDir);
    this.issuerRef = required(issuerRef, "issuer_ref");
    this.subjectsDir = path.join(this.stateDir, "subjects");
    this.loginIndexFile = path.join(this.stateDir, "login-index.json");
    this.eventsFile = path.join(this.stateDir, "events.jsonl");
    this.sessionControlFile = path.join(this.stateDir, "session-control.json");
  }

  #loginIndex() {
    if (!fs.existsSync(this.loginIndexFile)) return {};
    return JSON.parse(fs.readFileSync(this.loginIndexFile, "utf8"));
  }

  #subjectFile(subjectRef) {
    const digest = createHash("sha256").update(subjectRef).digest("hex");
    return path.join(this.subjectsDir, digest + ".json");
  }

  #appendEvent(event) {
    fs.mkdirSync(this.stateDir, { recursive: true, mode: 0o700 });
    fs.appendFileSync(this.eventsFile, JSON.stringify(event) + "\n", { mode: 0o600 });
  }


  #sessionControl() {
    if (!fs.existsSync(this.sessionControlFile)) {
      return {
        schema: "evercraft.identity.session-control.v1",
        revoked_sessions: {},
        subject_not_before: {},
        updated_at: null,
      };
    }
    const state = JSON.parse(fs.readFileSync(this.sessionControlFile, "utf8"));
    return {
      schema: "evercraft.identity.session-control.v1",
      revoked_sessions: state?.revoked_sessions && typeof state.revoked_sessions === "object"
        ? state.revoked_sessions
        : {},
      subject_not_before: state?.subject_not_before && typeof state.subject_not_before === "object"
        ? state.subject_not_before
        : {},
      updated_at: state?.updated_at || null,
    };
  }

  #writeSessionControl(state, updatedAt) {
    atomicJson(this.sessionControlFile, {
      schema: "evercraft.identity.session-control.v1",
      revoked_sessions: state.revoked_sessions || {},
      subject_not_before: state.subject_not_before || {},
      updated_at: new Date(updatedAt).toISOString(),
    });
  }

  revokeSession({ sessionId, subjectRef, reason = "signed_out", at = new Date().toISOString() } = {}) {
    const id = required(sessionId, "session_id");
    const subject = required(subjectRef, "subject_ref");
    const occurredAt = new Date(at).toISOString();
    const state = this.#sessionControl();
    state.revoked_sessions[id] = {
      subject_ref: subject,
      reason: required(reason, "reason"),
      revoked_at: occurredAt,
    };
    this.#writeSessionControl(state, occurredAt);
    const event = receipt({
      schema: "evercraft.identity.event.v1",
      event_id: "identity_event_" + randomUUID(),
      type: "session.revoked",
      subject_ref: subject,
      session_id: id,
      reason: state.revoked_sessions[id].reason,
      occurred_at: occurredAt,
    });
    this.#appendEvent(event);
    return { state: "revoked", session_id: id, subject_ref: subject, receipt: event };
  }

  revokeSubjectSessions({ subjectRef, reason = "sign_out_everywhere", at = new Date().toISOString() } = {}) {
    const subject = required(subjectRef, "subject_ref");
    const occurredAt = new Date(at).toISOString();
    const state = this.#sessionControl();
    state.subject_not_before[subject] = {
      not_before: occurredAt,
      reason: required(reason, "reason"),
    };
    this.#writeSessionControl(state, occurredAt);
    const event = receipt({
      schema: "evercraft.identity.event.v1",
      event_id: "identity_event_" + randomUUID(),
      type: "subject.sessions.revoked",
      subject_ref: subject,
      not_before: occurredAt,
      reason: state.subject_not_before[subject].reason,
      occurred_at: occurredAt,
    });
    this.#appendEvent(event);
    return { state: "revoked_all", subject_ref: subject, not_before: occurredAt, receipt: event };
  }

  assertSessionActive(session) {
    if (!session?.session_id || !session?.subject_ref || !session?.issued_at) {
      throw new Error("session_identity_incomplete");
    }
    const state = this.#sessionControl();
    if (state.revoked_sessions[session.session_id]) {
      throw new Error("session_revoked");
    }
    const subjectCutoff = state.subject_not_before[session.subject_ref]?.not_before;
    if (subjectCutoff) {
      const issuedAt = new Date(session.issued_at).getTime();
      const cutoff = new Date(subjectCutoff).getTime();
      if (Number.isFinite(issuedAt) && Number.isFinite(cutoff) && issuedAt <= cutoff) {
        throw new Error("session_subject_revoked");
      }
    }
    return { active: true, session_id: session.session_id, subject_ref: session.subject_ref };
  }

  getSubject(subjectRef) {
    const ref = required(subjectRef, "subject_ref");
    const file = this.#subjectFile(ref);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  }

  subjectForLogin(login) {
    const key = safeLogin(login);
    const subjectRef = this.#loginIndex()[key];
    return subjectRef ? this.getSubject(subjectRef) : null;
  }

  bootstrapOwner({
    subjectRef,
    login,
    displayName,
    password,
    authorityReceiptRef,
    createdAt = new Date().toISOString(),
  } = {}) {
    const ref = required(subjectRef, "subject_ref");
    const loginName = safeLogin(login);
    const name = required(displayName, "display_name");
    const secret = validatePassword(password);
    const authority = required(authorityReceiptRef, "authority_receipt_ref");
    const index = this.#loginIndex();

    if (Object.keys(index).length > 0) throw new Error("identity_bootstrap_already_completed");
    if (this.getSubject(ref)) throw new Error("subject_already_exists");

    const salt = randomBytes(24).toString("base64url");
    const hash = passwordDigest(secret, salt).toString("base64url");
    const subject = receipt({
      schema: IDENTITY_SCHEMA,
      subject_ref: ref,
      login: loginName,
      display_name: name,
      status: "active",
      credential: {
        scheme: "scrypt-v1",
        salt,
        hash,
        params: { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, keylen: SCRYPT.keylen },
      },
      bootstrap_authority_receipt_ref: authority,
      created_at: new Date(createdAt).toISOString(),
      updated_at: new Date(createdAt).toISOString(),
    });

    atomicJson(this.#subjectFile(ref), subject);
    atomicJson(this.loginIndexFile, { [loginName]: ref });

    const event = receipt({
      schema: "evercraft.identity.event.v1",
      event_id: "identity_event_" + randomUUID(),
      type: "owner.bootstrapped",
      subject_ref: ref,
      login: loginName,
      authority_receipt_ref: authority,
      occurred_at: new Date(createdAt).toISOString(),
    });
    this.#appendEvent(event);

    return {
      state: "bootstrapped",
      subject: {
        schema: subject.schema,
        subject_ref: subject.subject_ref,
        login: subject.login,
        display_name: subject.display_name,
        status: subject.status,
        created_at: subject.created_at,
        receipt_hash: subject.receipt_hash,
      },
      receipt: event,
    };
  }

  provisionSubject({
    subjectRef = "user:" + randomUUID(),
    login,
    displayName,
    password,
    authorityState,
    authorityReceiptRef,
    createdAt = new Date().toISOString(),
  } = {}) {
    const ref = required(subjectRef, "subject_ref");
    const loginName = safeLogin(login);
    const name = required(displayName || loginName, "display_name");
    const secret = validatePassword(password);
    const authorityStateValue = required(authorityState, "authority_state");
    if (!TRUSTED_PROVISION_AUTHORITY_STATES.has(authorityStateValue)) {
      throw new Error("identity_provision_authority_not_verified");
    }
    const authority = required(authorityReceiptRef, "authority_receipt_ref");
    const index = this.#loginIndex();

    if (index[loginName]) throw new Error("identity_login_conflict");
    if (this.getSubject(ref)) throw new Error("subject_already_exists");

    const salt = randomBytes(24).toString("base64url");
    const hash = passwordDigest(secret, salt).toString("base64url");
    const at = new Date(createdAt).toISOString();
    const subject = receipt({
      schema: IDENTITY_SCHEMA,
      subject_ref: ref,
      login: loginName,
      display_name: name,
      status: "active",
      credential: {
        scheme: "scrypt-v1",
        salt,
        hash,
        params: { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, keylen: SCRYPT.keylen },
      },
      provision_authority_state: authorityStateValue,
      provision_authority_receipt_ref: authority,
      created_at: at,
      updated_at: at,
    });

    atomicJson(this.#subjectFile(ref), subject);
    atomicJson(this.loginIndexFile, { ...index, [loginName]: ref });

    const event = receipt({
      schema: "evercraft.identity.event.v1",
      event_id: "identity_event_" + randomUUID(),
      type: "subject.provisioned",
      subject_ref: ref,
      login: loginName,
      authority_state: authorityStateValue,
      authority_receipt_ref: authority,
      occurred_at: at,
    });
    this.#appendEvent(event);

    return {
      state: "provisioned",
      subject: {
        schema: subject.schema,
        subject_ref: subject.subject_ref,
        login: subject.login,
        display_name: subject.display_name,
        status: subject.status,
        created_at: subject.created_at,
        receipt_hash: subject.receipt_hash,
      },
      receipt: event,
    };
  }

  updateProfile({
    subjectRef,
    displayName,
    authorityState = "authenticated_self",
    authorityReceiptRef,
    actorRef = null,
    at = new Date().toISOString(),
  } = {}) {
    const ref = required(subjectRef, "subject_ref");
    const state = required(authorityState, "authority_state");
    if (!TRUSTED_PROFILE_AUTHORITY_STATES.has(state)) {
      throw new Error("identity_profile_authority_not_verified");
    }
    const actor = required(actorRef || ref, "actor_ref");
    if (state === "authenticated_self" && actor !== ref) throw new Error("identity_profile_actor_mismatch");
    const authority = required(authorityReceiptRef, "authority_receipt_ref");
    const subject = this.getSubject(ref);
    if (!subject || subject.status !== "active") throw new Error("subject_not_found");
    const updatedAt = new Date(at).toISOString();
    const next = receipt({
      ...subject,
      display_name: required(displayName, "display_name"),
      updated_at: updatedAt,
    });
    atomicJson(this.#subjectFile(ref), next);
    const event = receipt({
      schema: "evercraft.identity.event.v1",
      event_id: "identity_event_" + randomUUID(),
      type: "subject.profile.updated",
      subject_ref: ref,
      actor_ref: actor,
      authority_state: state,
      authority_receipt_ref: authority,
      occurred_at: updatedAt,
    });
    this.#appendEvent(event);
    return {
      state: "updated",
      subject: {
        schema: next.schema,
        subject_ref: next.subject_ref,
        login: next.login,
        display_name: next.display_name,
        status: next.status,
        updated_at: next.updated_at,
        receipt_hash: next.receipt_hash,
      },
      receipt: event,
    };
  }

  replacePassword({
    subjectRef,
    newPassword,
    authorityState,
    authorityReceiptRef,
    actorRef = null,
    at = new Date().toISOString(),
  } = {}) {
    const ref = required(subjectRef, "subject_ref");
    const state = required(authorityState, "authority_state");
    if (!TRUSTED_PASSWORD_AUTHORITY_STATES.has(state)) {
      throw new Error("identity_password_authority_not_verified");
    }
    const authority = required(authorityReceiptRef, "authority_receipt_ref");
    const actor = required(actorRef || ref, "actor_ref");
    const subject = this.getSubject(ref);
    if (!subject || subject.status !== "active") throw new Error("subject_not_found");
    const secret = validatePassword(newPassword);
    const salt = randomBytes(24).toString("base64url");
    const hash = passwordDigest(secret, salt).toString("base64url");
    const updatedAt = new Date(at).toISOString();
    const next = receipt({
      ...subject,
      credential: {
        scheme: "scrypt-v1",
        salt,
        hash,
        params: { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, keylen: SCRYPT.keylen },
      },
      updated_at: updatedAt,
    });
    atomicJson(this.#subjectFile(ref), next);
    this.revokeSubjectSessions({
      subjectRef: ref,
      reason: "credential_replaced",
      at: updatedAt,
    });
    const event = receipt({
      schema: "evercraft.identity.event.v1",
      event_id: "identity_event_" + randomUUID(),
      type: "subject.password.replaced",
      subject_ref: ref,
      actor_ref: actor,
      authority_state: state,
      authority_receipt_ref: authority,
      occurred_at: updatedAt,
    });
    this.#appendEvent(event);
    return { state: "password_replaced", subject_ref: ref, receipt: event };
  }

  authenticatePassword({ login, password } = {}) {
    const subject = this.subjectForLogin(login);
    const supplied = String(password || "");
    const fakeSalt = "evercraft-invalid-login-salt";
    const expected = subject?.credential?.hash
      ? Buffer.from(subject.credential.hash, "base64url")
      : passwordDigest("invalid-password-padding", fakeSalt);
    const actual = passwordDigest(supplied || "invalid-password-padding", subject?.credential?.salt || fakeSalt);
    const matches = expected.length === actual.length && timingSafeEqual(expected, actual);

    if (!subject || subject.status !== "active" || !matches) {
      throw new Error("identity_credentials_invalid");
    }

    return {
      schema: "evercraft.identity.authentication.v1",
      subject_ref: subject.subject_ref,
      display_name: subject.display_name,
      auth_strength: "password",
      authenticated_at: new Date().toISOString(),
    };
  }

  issueSession(authentication, {
    signingSecret,
    signingKeyId = "primary",
    ttlSeconds = 1800,
    now = new Date(),
  } = {}) {
    const secret = required(signingSecret, "signing_secret");
    const keyId = required(signingKeyId, "signing_key_id");
    if (!/^[a-zA-Z0-9._:-]{1,80}$/.test(keyId)) throw new Error("signing_key_id_invalid");
    if (Buffer.byteLength(secret, "utf8") < 32) throw new Error("signing_secret_too_short");
    if (authentication?.schema !== "evercraft.identity.authentication.v1") {
      throw new Error("authentication_required");
    }

    const ttl = Math.max(300, Math.min(8 * 60 * 60, Number(ttlSeconds || 1800)));
    const issuedAt = new Date(now);
    const expiresAt = new Date(issuedAt.getTime() + ttl * 1000);
    const payload = {
      schema: SESSION_SCHEMA,
      session_id: "session_" + randomUUID(),
      subject_ref: authentication.subject_ref,
      display_name: authentication.display_name,
      auth_strength: authentication.auth_strength,
      signing_key_id: keyId,
      issuer_ref: this.issuerRef,
      issued_at: issuedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = createHmac("sha256", secret).update(encoded).digest("base64url");

    const event = receipt({
      schema: "evercraft.identity.event.v1",
      event_id: "identity_event_" + randomUUID(),
      type: "session.issued",
      subject_ref: payload.subject_ref,
      session_id: payload.session_id,
      auth_strength: payload.auth_strength,
      signing_key_id: payload.signing_key_id,
      expires_at: payload.expires_at,
      occurred_at: issuedAt.toISOString(),
    });
    this.#appendEvent(event);

    return {
      token: encoded + "." + signature,
      session: payload,
      receipt: event,
    };
  }
}

export class IdentityRateLimiter {
  constructor({ maxFailures = 5, windowMs = 10 * 60 * 1000, blockMs = 15 * 60 * 1000 } = {}) {
    this.maxFailures = maxFailures;
    this.windowMs = windowMs;
    this.blockMs = blockMs;
    this.entries = new Map();
  }

  #entry(key, now) {
    const current = this.entries.get(key);
    if (!current || now - current.window_started_at > this.windowMs) {
      const next = { failures: 0, window_started_at: now, blocked_until: 0 };
      this.entries.set(key, next);
      return next;
    }
    return current;
  }

  assertAllowed(key, now = Date.now()) {
    const entry = this.#entry(String(key || "unknown"), now);
    if (entry.blocked_until > now) throw new Error("identity_login_rate_limited");
  }

  recordFailure(key, now = Date.now()) {
    const entry = this.#entry(String(key || "unknown"), now);
    entry.failures += 1;
    if (entry.failures >= this.maxFailures) entry.blocked_until = now + this.blockMs;
  }

  recordSuccess(key) {
    this.entries.delete(String(key || "unknown"));
  }
}
