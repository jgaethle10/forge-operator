import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { EvercraftIdentity } from './identity.mjs';

function clean(value) { return String(value ?? '').trim(); }
function sha(value) {
  return 'sha256:' + createHash('sha256')
    .update(Buffer.isBuffer(value) ? value : Buffer.from(String(value)))
    .digest('hex');
}
function required(value, field) {
  const text = clean(value);
  if (!text) throw new Error(field + '_required');
  return text;
}
function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = file + '.' + process.pid + '.' + randomBytes(4).toString('hex') + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
}
function validatePendingPassword(password) {
  const value = String(password || '');
  if (value.length < 14) throw new Error('password_too_short');
  if (value.length > 512) throw new Error('password_too_long');
  return value;
}
function equalHash(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && timingSafeEqual(a, b);
}

export class EvercraftIdentityChallengeBroker {
  constructor({
    stateDir,
    identity,
    secretStore,
    deliverChallenge,
    registrationTtlSeconds = 600,
    resetTtlSeconds = 900,
    maxAttempts = 5
  } = {}) {
    if (!stateDir) throw new Error('identity_challenge_state_dir_required');
    if (!(identity instanceof EvercraftIdentity)) throw new Error('evercraft_identity_required');
    if (!secretStore || typeof secretStore.setSecret !== 'function' || typeof secretStore.getSecretText !== 'function') {
      throw new Error('identity_challenge_secret_store_required');
    }
    if (typeof deliverChallenge !== 'function') throw new Error('identity_challenge_delivery_required');
    this.stateDir = path.resolve(stateDir);
    this.identity = identity;
    this.secretStore = secretStore;
    this.deliverChallenge = deliverChallenge;
    this.registrationTtlSeconds = Math.max(120, Math.min(3600, Number(registrationTtlSeconds || 600)));
    this.resetTtlSeconds = Math.max(120, Math.min(3600, Number(resetTtlSeconds || 900)));
    this.maxAttempts = Math.max(3, Math.min(10, Number(maxAttempts || 5)));
    this.challengesDir = path.join(this.stateDir, 'challenges');
    this.indexDir = path.join(this.stateDir, 'index');
    this.receiptsFile = path.join(this.stateDir, 'receipts.jsonl');
  }

  #challengeFile(id) {
    const key = required(id, 'challenge_id');
    if (!/^challenge_[a-f0-9-]{20,80}$/i.test(key)) throw new Error('challenge_id_invalid');
    return path.join(this.challengesDir, key + '.json');
  }

  #indexFile(appKey, kind, login) {
    const digest = createHash('sha256')
      .update([required(appKey, 'app_key'), required(kind, 'challenge_kind'), required(login, 'login').toLowerCase()].join('\n'))
      .digest('hex');
    return path.join(this.indexDir, digest + '.json');
  }

  #secretNamespace(appKey) {
    return 'identity-challenge:' + createHash('sha256').update(required(appKey, 'app_key')).digest('hex').slice(0, 24);
  }

  #appendReceipt(body) {
    const result = { ...body, receipt_hash: sha(JSON.stringify(body)) };
    fs.mkdirSync(this.stateDir, { recursive: true, mode: 0o700 });
    fs.appendFileSync(this.receiptsFile, JSON.stringify(result) + '\n', { mode: 0o600 });
    return result;
  }

  #read(id) {
    const file = this.#challengeFile(id);
    if (!fs.existsSync(file)) throw new Error('identity_challenge_not_found');
    const state = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (state?.schema !== 'evercraft.identity.challenge.v1') throw new Error('identity_challenge_schema_invalid');
    return { file, state };
  }

  #findByLogin(appKey, kind, login) {
    const file = this.#indexFile(appKey, kind, login);
    if (!fs.existsSync(file)) throw new Error('identity_challenge_not_found');
    const row = JSON.parse(fs.readFileSync(file, 'utf8'));
    return this.#read(row.challenge_id);
  }

  #assertUsable(state, appKey, kind, now = new Date()) {
    if (state.kind !== kind) throw new Error('identity_challenge_kind_mismatch');
    if (state.app_key_hash !== sha(appKey)) throw new Error('identity_challenge_app_mismatch');
    if (state.delivery_state !== 'delivered') throw new Error('identity_challenge_not_delivered');
    if (state.consumed_at) throw new Error('identity_challenge_consumed');
    if (Number(state.attempts || 0) >= this.maxAttempts) throw new Error('identity_challenge_attempts_exceeded');
    if (new Date(now) >= new Date(state.expires_at)) throw new Error('identity_challenge_expired');
  }

  async #deliverAndPersist(state, codeOrToken, { appKey, login, kind }) {
    atomicJson(this.#challengeFile(state.challenge_id), state);
    atomicJson(this.#indexFile(appKey, kind, login), {
      schema: 'evercraft.identity.challenge-index.v1',
      challenge_id: state.challenge_id,
      updated_at: state.updated_at
    });

    let delivery;
    try {
      delivery = await this.deliverChallenge({
        appKey,
        kind,
        login,
        challengeId: state.challenge_id,
        expiresAt: state.expires_at,
        code: kind === 'registration' ? codeOrToken : undefined,
        resetToken: kind === 'password_reset' ? codeOrToken : undefined
      });
    } catch (error) {
      state.delivery_state = 'failed';
      state.delivery_error = String(error?.message || error || 'delivery_failed').slice(0, 240);
      state.updated_at = new Date().toISOString();
      atomicJson(this.#challengeFile(state.challenge_id), state);
      throw new Error('identity_challenge_delivery_failed');
    }

    const deliveryReceiptRef = required(
      delivery?.receipt_ref || delivery?.receiptHash || delivery?.receipt_hash,
      'delivery_receipt_ref'
    );
    state.delivery_state = 'delivered';
    state.delivery_receipt_ref = deliveryReceiptRef;
    state.delivery_error = null;
    state.updated_at = new Date().toISOString();
    atomicJson(this.#challengeFile(state.challenge_id), state);

    const receipt = this.#appendReceipt({
      schema: 'evercraft.identity.challenge-receipt.v1',
      receipt_id: 'identity_challenge_' + randomUUID(),
      operation: kind === 'registration' ? 'registration.challenge.delivered' : 'password_reset.challenge.delivered',
      challenge_id: state.challenge_id,
      app_key_hash: state.app_key_hash,
      login_hash: state.login_hash,
      delivery_receipt_ref: deliveryReceiptRef,
      code_or_token_emitted_to_receipt: false,
      occurred_at: state.updated_at
    });
    return { state, receipt };
  }

  async beginRegistration({ appKey, body = {} } = {}) {
    const login = required(body.login || body.email, 'login').toLowerCase();
    const password = validatePendingPassword(body.password);
    const displayName = clean(body.display_name || body.displayName || body.name || login);
    if (this.identity.subjectForLogin(login)) throw new Error('identity_login_conflict');

    const challengeId = 'challenge_' + randomUUID();
    const code = String(randomInt(100000, 1000000));
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.registrationTtlSeconds * 1000).toISOString();
    const namespace = this.#secretNamespace(appKey);
    const secretName = challengeId + ':pending-password';

    this.secretStore.setSecret(namespace, secretName, password, {
      metadata: {
        purpose: 'pending_identity_registration',
        challenge_id: challengeId,
        login_hash: sha(login)
      },
      now
    });

    const state = {
      schema: 'evercraft.identity.challenge.v1',
      challenge_id: challengeId,
      kind: 'registration',
      app_key_hash: sha(appKey),
      login,
      login_hash: sha(login),
      display_name: displayName,
      code_hash: sha(challengeId + ':' + code),
      secret_namespace: namespace,
      secret_name: secretName,
      attempts: 0,
      delivery_state: 'pending',
      delivery_receipt_ref: null,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      expires_at: expiresAt,
      consumed_at: null
    };

    try {
      const delivered = await this.#deliverAndPersist(state, code, { appKey, login, kind: 'registration' });
      return {
        status: 'verification_required',
        challenge_id: challengeId,
        expires_at: expiresAt,
        delivery_receipt_ref: delivered.state.delivery_receipt_ref
      };
    } catch (error) {
      try { this.secretStore.deleteSecret(namespace, secretName); } catch {}
      throw error;
    }
  }

  async resendRegistration({ appKey, body = {} } = {}) {
    const login = required(body.login || body.email, 'login').toLowerCase();
    const found = body.challenge_id ? this.#read(body.challenge_id) : this.#findByLogin(appKey, 'registration', login);
    const state = found.state;
    this.#assertUsable({ ...state, attempts: 0 }, appKey, 'registration');
    if (state.login !== login) throw new Error('identity_challenge_login_mismatch');

    const code = String(randomInt(100000, 1000000));
    const now = new Date();
    state.code_hash = sha(state.challenge_id + ':' + code);
    state.attempts = 0;
    state.delivery_state = 'pending';
    state.delivery_receipt_ref = null;
    state.updated_at = now.toISOString();
    state.expires_at = new Date(now.getTime() + this.registrationTtlSeconds * 1000).toISOString();
    const delivered = await this.#deliverAndPersist(state, code, { appKey, login, kind: 'registration' });
    return {
      status: 'verification_required',
      challenge_id: state.challenge_id,
      expires_at: state.expires_at,
      delivery_receipt_ref: delivered.state.delivery_receipt_ref
    };
  }

  async verifyRegistration({ appKey, body = {} } = {}) {
    const login = required(body.login || body.email, 'login').toLowerCase();
    const code = required(body.otpCode || body.otp_code || body.code, 'otp_code');
    const found = body.challenge_id ? this.#read(body.challenge_id) : this.#findByLogin(appKey, 'registration', login);
    const state = found.state;
    this.#assertUsable(state, appKey, 'registration');
    if (state.login !== login) throw new Error('identity_challenge_login_mismatch');

    const observed = sha(state.challenge_id + ':' + code);
    if (!equalHash(observed, state.code_hash)) {
      state.attempts = Number(state.attempts || 0) + 1;
      state.updated_at = new Date().toISOString();
      atomicJson(found.file, state);
      throw new Error('identity_challenge_code_invalid');
    }

    const verifiedAt = new Date().toISOString();
    const verification = this.#appendReceipt({
      schema: 'evercraft.identity.challenge-receipt.v1',
      receipt_id: 'identity_challenge_' + randomUUID(),
      operation: 'registration.challenge.verified',
      challenge_id: state.challenge_id,
      app_key_hash: state.app_key_hash,
      login_hash: state.login_hash,
      delivery_receipt_ref: state.delivery_receipt_ref,
      occurred_at: verifiedAt
    });

    const password = this.secretStore.getSecretText(state.secret_namespace, state.secret_name);
    const provisioned = this.identity.provisionSubject({
      login: state.login,
      displayName: state.display_name,
      password,
      authorityState: 'challenge_verified',
      authorityReceiptRef: verification.receipt_hash,
      createdAt: verifiedAt
    });
    this.secretStore.deleteSecret(state.secret_namespace, state.secret_name);
    state.consumed_at = verifiedAt;
    state.updated_at = verifiedAt;
    atomicJson(found.file, state);
    return {
      verified: true,
      status: 'registered',
      subject_ref: provisioned.subject.subject_ref,
      user: provisioned.subject,
      receipt_hash: provisioned.receipt.receipt_hash
    };
  }

  async beginReset({ appKey, body = {} } = {}) {
    const login = required(body.login || body.email, 'login').toLowerCase();
    const subject = this.identity.subjectForLogin(login);
    if (!subject || subject.status !== 'active') {
      return { status: 'accepted', delivery_state: 'not_disclosed' };
    }

    const challengeId = 'challenge_' + randomUUID();
    const tokenSecret = randomBytes(24).toString('base64url');
    const resetToken = challengeId + '.' + tokenSecret;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.resetTtlSeconds * 1000).toISOString();
    const state = {
      schema: 'evercraft.identity.challenge.v1',
      challenge_id: challengeId,
      kind: 'password_reset',
      app_key_hash: sha(appKey),
      login,
      login_hash: sha(login),
      subject_ref: subject.subject_ref,
      token_hash: sha(resetToken),
      attempts: 0,
      delivery_state: 'pending',
      delivery_receipt_ref: null,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      expires_at: expiresAt,
      consumed_at: null
    };
    const delivered = await this.#deliverAndPersist(state, resetToken, { appKey, login, kind: 'password_reset' });
    void delivered;
    return { status: 'accepted', delivery_state: 'not_disclosed' };
  }

  async completeReset({ appKey, body = {} } = {}) {
    const resetToken = required(body.resetToken || body.reset_token, 'reset_token');
    const [challengeId, secretPart, extra] = resetToken.split('.');
    if (!challengeId || !secretPart || extra) throw new Error('reset_token_invalid');
    const found = this.#read(challengeId);
    const state = found.state;
    this.#assertUsable(state, appKey, 'password_reset');

    if (!equalHash(sha(resetToken), state.token_hash)) {
      state.attempts = Number(state.attempts || 0) + 1;
      state.updated_at = new Date().toISOString();
      atomicJson(found.file, state);
      throw new Error('reset_token_invalid');
    }

    const newPassword = validatePendingPassword(body.newPassword || body.new_password);
    const verifiedAt = new Date().toISOString();
    const verification = this.#appendReceipt({
      schema: 'evercraft.identity.challenge-receipt.v1',
      receipt_id: 'identity_challenge_' + randomUUID(),
      operation: 'password_reset.challenge.verified',
      challenge_id: state.challenge_id,
      app_key_hash: state.app_key_hash,
      login_hash: state.login_hash,
      delivery_receipt_ref: state.delivery_receipt_ref,
      occurred_at: verifiedAt
    });

    const result = this.identity.replacePassword({
      subjectRef: state.subject_ref,
      newPassword,
      authorityState: 'challenge_verified',
      authorityReceiptRef: verification.receipt_hash,
      at: verifiedAt
    });
    state.consumed_at = verifiedAt;
    state.updated_at = verifiedAt;
    atomicJson(found.file, state);
    return {
      reset: true,
      status: 'password_replaced',
      receipt_hash: result.receipt.receipt_hash
    };
  }

  health() {
    fs.mkdirSync(this.stateDir, { recursive: true, mode: 0o700 });
    return {
      schema: 'evercraft.identity.challenge-health.v1',
      state: 'healthy',
      registration_delivery_required: true,
      password_reset_delivery_required: true,
      pending_passwords_in_secret_store: true,
      plaintext_codes_or_tokens_persisted: false,
      max_attempts: this.maxAttempts
    };
  }
}
