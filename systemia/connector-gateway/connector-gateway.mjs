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
function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
}

export class EvercraftConnectorGateway {
  constructor({ stateDir, secretStore, adapters = {} } = {}) {
    if (!stateDir) throw new Error('connector_state_dir_required');
    if (!secretStore) throw new Error('connector_secret_store_required');
    this.stateDir = path.resolve(stateDir);
    this.secretStore = secretStore;
    this.connectionsDir = path.join(this.stateDir, 'connections');
    this.receiptsFile = path.join(this.stateDir, 'receipts.jsonl');
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
      plaintext_credentials_in_connector_state: false
    };
  }
}
