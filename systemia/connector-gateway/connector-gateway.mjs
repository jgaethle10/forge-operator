import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

function clean(value) { return String(value ?? '').trim(); }
function safeKey(value, field) {
  const key = clean(value);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(key)) throw new Error(`${field}_invalid`);
  return key;
}
function sha(value) { return 'sha256:' + createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex'); }
function appHash(appKey) { return createHash('sha256').update(appKey).digest('hex').slice(0, 32); }
function normalizeOwnedRedirectUri(value, { allowLoopbackProof = false } = {}) {
  const url = new URL(clean(value));
  if (url.username || url.password) throw new Error('connector_redirect_credentials_forbidden');
  const host = url.hostname.toLowerCase();
  const loopback = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  if (loopback) {
    if (!allowLoopbackProof) throw new Error('connector_redirect_loopback_forbidden');
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('connector_redirect_protocol_invalid');
  } else if (url.protocol !== 'https:') {
    throw new Error('connector_redirect_https_required');
  }
  if (host === 'base44.app' || host.endsWith('.base44.app')) {
    throw new Error('connector_redirect_base44_forbidden');
  }
  return url.toString();
}
function stateHash(value) {
  return createHash('sha256').update(clean(value)).digest('hex');
}
function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
}

export class EvercraftConnectorGateway {
  constructor({ stateDir, secretStore, adapters = {}, allowLoopbackProof = false } = {}) {
    if (!stateDir) throw new Error('connector_state_dir_required');
    if (!secretStore) throw new Error('connector_secret_store_required');
    this.stateDir = path.resolve(stateDir);
    this.secretStore = secretStore;
    this.connectionsDir = path.join(this.stateDir, 'connections');
    this.oauthStatesDir = path.join(this.stateDir, 'oauth-states');
    this.receiptsFile = path.join(this.stateDir, 'receipts.jsonl');
    this.allowLoopbackProof = Boolean(allowLoopbackProof);
    this.adapters = new Map();
    for (const [provider, adapter] of Object.entries(adapters || {})) this.registerProvider(provider, adapter);
  }

  registerProvider(providerInput, adapter) {
    const provider = safeKey(providerInput, 'connector_provider');
    if (!adapter || typeof adapter.exchangeAuthorization !== 'function' || typeof adapter.invoke !== 'function') {
      throw new Error('connector_adapter_invalid');
    }
    this.adapters.set(provider, adapter);
    return this;
  }

  #location(appKeyInput, providerInput) {
    const appKey = safeKey(appKeyInput, 'app_key');
    const provider = safeKey(providerInput, 'connector_provider');
    return {
      appKey,
      provider,
      file: path.join(this.connectionsDir, appHash(appKey), `${provider}.json`),
      secretNamespace: `connector:${appKey}:${provider}`,
      secretName: 'credential'
    };
  }

  #adapter(provider) {
    const adapter = this.adapters.get(provider);
    if (!adapter) throw new Error('connector_adapter_not_registered');
    return adapter;
  }

  #appendReceipt(body) {
    const receipt = { ...body, receipt_hash: sha(body) };
    fs.mkdirSync(this.stateDir, { recursive: true, mode: 0o700 });
    fs.appendFileSync(this.receiptsFile, JSON.stringify(receipt) + '\n', { mode: 0o600 });
    return receipt;
  }

  #readConnection(location) {
    if (!fs.existsSync(location.file)) throw new Error('connector_not_connected');
    const connection = JSON.parse(fs.readFileSync(location.file, 'utf8'));
    if (connection?.schema !== 'evercraft.connector.connection.v1') throw new Error('connector_connection_schema_invalid');
    if (connection.app_key_hash !== sha(location.appKey) || connection.provider !== location.provider) throw new Error('connector_connection_identity_mismatch');
    return connection;
  }

  #oauthStateFile(appKey, provider, state) {
    const location = this.#location(appKey, provider);
    const digest = stateHash(state);
    return {
      ...location,
      digest,
      file: path.join(this.oauthStatesDir, appHash(location.appKey), location.provider, digest + '.json')
    };
  }

  async beginAuthorization(appKey, provider, {
    redirectUri,
    scopes = [],
    providerContext = {},
    ttlSeconds = 600,
    now = new Date()
  } = {}) {
    const location = this.#location(appKey, provider);
    const adapter = this.#adapter(location.provider);
    if (typeof adapter.buildAuthorizationUrl !== 'function') {
      throw new Error('connector_authorization_start_not_supported');
    }
    const redirect = normalizeOwnedRedirectUri(redirectUri, {
      allowLoopbackProof: this.allowLoopbackProof
    });
    const requestedScopes = [...new Set((scopes || []).map((scope) => clean(scope)).filter(Boolean))].sort();
    const state = randomBytes(24).toString('base64url');
    const stateLocation = this.#oauthStateFile(location.appKey, location.provider, state);
    const at = new Date(now);
    const ttl = Math.max(120, Math.min(1800, Number(ttlSeconds) || 600));
    const expiresAt = new Date(at.getTime() + ttl * 1000).toISOString();

    const authorizationUrl = await adapter.buildAuthorizationUrl({
      appKey: location.appKey,
      provider: location.provider,
      state,
      redirectUri: redirect,
      scopes: requestedScopes,
      context: providerContext
    });
    const target = new URL(clean(authorizationUrl));
    if (target.protocol !== 'https:' || target.username || target.password) {
      throw new Error('connector_authorization_url_invalid');
    }

    const record = {
      schema: 'evercraft.connector.oauth-state.v1',
      app_key_hash: sha(location.appKey),
      provider: location.provider,
      state_hash: 'sha256:' + stateLocation.digest,
      redirect_uri: redirect,
      scopes: requestedScopes,
      status: 'pending',
      created_at: at.toISOString(),
      expires_at: expiresAt,
      consumed_at: null
    };
    atomicJson(stateLocation.file, record);
    const receipt = this.#appendReceipt({
      schema: 'evercraft.connector.receipt.v1',
      receipt_id: `connector_receipt_${randomUUID()}`,
      operation: 'authorization_begin',
      app_key_hash: record.app_key_hash,
      provider: record.provider,
      state_hash: record.state_hash,
      redirect_uri: redirect,
      scopes: requestedScopes,
      authorization_code_emitted: false,
      credential_value_emitted: false,
      occurred_at: at.toISOString()
    });
    return {
      authorization_url: target.toString(),
      state,
      expires_at: expiresAt,
      receipt
    };
  }

  async completeAuthorization(appKey, provider, {
    state,
    authorizationCode,
    redirectUri,
    providerContext = {},
    now = new Date()
  } = {}) {
    const rawState = clean(state);
    if (!rawState) throw new Error('connector_oauth_state_required');
    const location = this.#oauthStateFile(appKey, provider, rawState);
    if (!fs.existsSync(location.file)) throw new Error('connector_oauth_state_not_found');
    const record = JSON.parse(fs.readFileSync(location.file, 'utf8'));
    if (record?.schema !== 'evercraft.connector.oauth-state.v1') {
      throw new Error('connector_oauth_state_schema_invalid');
    }
    if (record.state_hash !== 'sha256:' + location.digest) throw new Error('connector_oauth_state_hash_mismatch');
    if (record.status !== 'pending' || record.consumed_at) throw new Error('connector_oauth_state_consumed');
    const at = new Date(now);
    if (at >= new Date(record.expires_at)) throw new Error('connector_oauth_state_expired');
    const redirect = normalizeOwnedRedirectUri(redirectUri, {
      allowLoopbackProof: this.allowLoopbackProof
    });
    if (redirect !== record.redirect_uri) throw new Error('connector_oauth_redirect_mismatch');

    const connected = await this.connect(location.appKey, location.provider, {
      authorizationCode,
      redirectUri: redirect,
      providerContext,
      now: at
    });
    const consumed = {
      ...record,
      status: 'consumed',
      consumed_at: at.toISOString()
    };
    atomicJson(location.file, consumed);
    const receipt = this.#appendReceipt({
      schema: 'evercraft.connector.receipt.v1',
      receipt_id: `connector_receipt_${randomUUID()}`,
      operation: 'authorization_complete',
      connection_id: connected.connection.connection_id,
      app_key_hash: record.app_key_hash,
      provider: record.provider,
      state_hash: record.state_hash,
      redirect_uri: redirect,
      credential_value_emitted: false,
      authorization_code_emitted: false,
      occurred_at: at.toISOString()
    });
    return {
      connection: connected.connection,
      connection_receipt: connected.receipt,
      authorization_receipt: receipt
    };
  }

  async connect(appKey, provider, {
    authorizationCode,
    redirectUri = null,
    providerContext = {},
    now = new Date()
  } = {}) {
    const location = this.#location(appKey, provider);
    const adapter = this.#adapter(location.provider);
    const code = clean(authorizationCode);
    if (!code) throw new Error('connector_authorization_code_required');
    const exchanged = await adapter.exchangeAuthorization({
      code,
      redirectUri,
      appKey: location.appKey,
      provider: location.provider,
      context: providerContext
    });
    const credential = exchanged?.credential;
    if (credential == null) throw new Error('connector_exchange_missing_credential');
    const credentialText = typeof credential === 'string' ? credential : JSON.stringify(credential);
    const secret = this.secretStore.setSecret(location.secretNamespace, location.secretName, credentialText, {
      metadata: { provider: location.provider, app_key_hash: sha(location.appKey) },
      now
    });
    const at = new Date(now).toISOString();
    const connection = {
      schema: 'evercraft.connector.connection.v1',
      connection_id: `connector_${randomUUID()}`,
      app_key_hash: sha(location.appKey),
      provider: location.provider,
      status: 'connected',
      credential_version: secret.version,
      credential_format: typeof credential === 'string' ? 'text' : 'json',
      provider_account_ref: exchanged?.provider_account_ref || null,
      scopes: Array.isArray(exchanged?.scopes) ? exchanged.scopes.map(String) : [],
      connected_at: at,
      updated_at: at
    };
    atomicJson(location.file, connection);
    const receipt = this.#appendReceipt({
      schema: 'evercraft.connector.receipt.v1',
      receipt_id: `connector_receipt_${randomUUID()}`,
      operation: 'connect',
      connection_id: connection.connection_id,
      app_key_hash: connection.app_key_hash,
      provider: connection.provider,
      credential_version: connection.credential_version,
      credential_value_emitted: false,
      occurred_at: at
    });
    return { connection: structuredClone(connection), receipt };
  }

  connection(appKey, provider) {
    return structuredClone(this.#readConnection(this.#location(appKey, provider)));
  }

  async invoke(appKey, provider, operationInput, input = {}, context = {}) {
    const location = this.#location(appKey, provider);
    const operation = safeKey(operationInput, 'connector_operation');
    const adapter = this.#adapter(location.provider);
    const connection = this.#readConnection(location);
    if (connection.status !== 'connected') throw new Error('connector_not_connected');
    const stored = this.secretStore.getSecretText(location.secretNamespace, location.secretName);
    const credential = connection.credential_format === 'json' ? JSON.parse(stored) : stored;
    return await adapter.invoke({
      operation,
      input,
      credential,
      appKey: location.appKey,
      provider: location.provider,
      connection: structuredClone(connection),
      context
    });
  }

  async disconnect(appKey, provider, { context = {}, now = new Date() } = {}) {
    const location = this.#location(appKey, provider);
    const adapter = this.#adapter(location.provider);
    const connection = this.#readConnection(location);
    const stored = this.secretStore.getSecretText(location.secretNamespace, location.secretName);
    const credential = connection.credential_format === 'json' ? JSON.parse(stored) : stored;
    if (typeof adapter.revoke === 'function') {
      await adapter.revoke({ credential, appKey: location.appKey, provider: location.provider, connection: structuredClone(connection), context });
    }
    this.secretStore.deleteSecret(location.secretNamespace, location.secretName, { now });
    fs.rmSync(location.file, { force: true });
    return this.#appendReceipt({
      schema: 'evercraft.connector.receipt.v1',
      receipt_id: `connector_receipt_${randomUUID()}`,
      operation: 'disconnect',
      connection_id: connection.connection_id,
      app_key_hash: connection.app_key_hash,
      provider: connection.provider,
      credential_value_emitted: false,
      occurred_at: new Date(now).toISOString()
    });
  }

  health() {
    fs.mkdirSync(this.stateDir, { recursive: true, mode: 0o700 });
    const probe = path.join(this.stateDir, `.health-${process.pid}-${randomBytes(4).toString('hex')}`);
    fs.writeFileSync(probe, 'ok', { mode: 0o600 });
    fs.unlinkSync(probe);
    return {
      schema: 'evercraft.connector.health.v1',
      state: 'healthy',
      registered_providers: [...this.adapters.keys()].sort(),
      credentials_stored_in_secret_store: true,
      plaintext_credentials_in_connector_state: false,
      oauth_state_hash_only_at_rest: true,
      owned_redirect_required_for_new_authorization: true,
      base44_redirect_for_new_authorization_allowed: false
    };
  }
}
