const SPECS = Object.freeze({
  alpaca: Object.freeze({
    provider: 'alpaca',
    label: 'daytrade-lens',
    environment: 'live',
  }),
  'google-places': Object.freeze({
    provider: 'google-places',
    label: 'household-fabric',
    environment: 'live',
  }),
  kroger: Object.freeze({
    provider: 'kroger',
    label: 'household-fabric',
    environment: 'live',
  }),
  kaggle: Object.freeze({
    provider: 'kaggle',
    label: 'competition-foundry',
    environment: 'live',
  }),
  numerai: Object.freeze({
    provider: 'numerai',
    label: 'competition-foundry',
    environment: 'live',
  }),
});

function clean(value) {
  return String(value ?? '').trim();
}

export function supportedCredentialProviders() {
  return Object.keys(SPECS);
}

export function credentialProviderSpec(provider) {
  const key = clean(provider).toLowerCase();
  return SPECS[key] || null;
}

export function normalizeProviderCredentialRequest(provider, body = {}) {
  const spec = credentialProviderSpec(provider);
  if (!spec) throw new Error('credential_provider_unsupported');

  if (spec.provider === 'alpaca') {
    return {
      provider: spec.provider,
      environment: clean(body.environment) || spec.environment,
      label: clean(body.label) || spec.label,
      apiKeyId: clean(body.api_key_id),
      apiSecret: clean(body.api_secret),
    };
  }

  if (spec.provider === 'google-places') {
    return {
      provider: spec.provider,
      environment: clean(body.environment) || spec.environment,
      label: clean(body.label) || spec.label,
      apiKeyId: 'google-places-api-key',
      apiSecret: clean(body.api_key),
    };
  }

  if (spec.provider === 'kaggle') {
    return {
      provider: spec.provider,
      environment: clean(body.environment) || spec.environment,
      label: clean(body.label) || spec.label,
      apiKeyId: 'kaggle-api-token',
      apiSecret: clean(body.api_token),
    };
  }

  if (spec.provider === 'numerai') {
    return {
      provider: spec.provider,
      environment: clean(body.environment) || spec.environment,
      label: clean(body.label) || spec.label,
      apiKeyId: clean(body.public_id),
      apiSecret: clean(body.secret_key),
    };
  }

  return {
    provider: spec.provider,
    environment: clean(body.environment) || spec.environment,
    label: clean(body.label) || spec.label,
    apiKeyId: clean(body.client_id),
    apiSecret: clean(body.client_secret),
  };
}
