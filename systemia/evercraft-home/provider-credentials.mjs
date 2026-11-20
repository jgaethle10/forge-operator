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
  qloo: Object.freeze({
    provider: 'qloo',
    label: 'competition-commonground',
    environment: 'live',
  }),
  nebius: Object.freeze({
    provider: 'nebius',
    label: 'competition-runbook-zero',
    environment: 'live',
  }),
  paypal: Object.freeze({
    provider: 'paypal',
    label: 'competition-checkout-black-box',
    environment: 'sandbox',
  }),
  'facebook-pages': Object.freeze({
    provider: 'facebook-pages',
    label: 'evercraft-clip',
    environment: 'live',
  }),
  'linkedin-organization': Object.freeze({
    provider: 'linkedin-organization',
    label: 'evercraft-clip',
    environment: 'live',
  }),
  gemini: Object.freeze({
    provider: 'gemini',
    label: 'raven-inference',
    environment: 'live',
  }),
  openai: Object.freeze({
    provider: 'openai',
    label: 'raven-inference',
    environment: 'live',
  }),
  anthropic: Object.freeze({ provider: 'anthropic', label: 'raven-inference', environment: 'live' }),
  xai: Object.freeze({ provider: 'xai', label: 'raven-inference', environment: 'live' }),
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

  if (spec.provider === 'qloo') {
    return {
      provider: spec.provider,
      environment: clean(body.environment) || spec.environment,
      label: clean(body.label) || spec.label,
      apiKeyId: 'qloo-api-key',
      apiSecret: clean(body.api_key),
    };
  }

  if (spec.provider === 'nebius') {
    return {
      provider: spec.provider,
      environment: clean(body.environment) || spec.environment,
      label: clean(body.label) || spec.label,
      apiKeyId: 'nebius-token-factory-key',
      apiSecret: clean(body.api_key),
    };
  }

  if (spec.provider === 'paypal') {
    return {
      provider: spec.provider,
      environment: clean(body.environment) || spec.environment,
      label: clean(body.label) || spec.label,
      apiKeyId: clean(body.client_id),
      apiSecret: clean(body.client_secret),
    };
  }

  if (spec.provider === 'gemini') {
    return {
      provider: spec.provider,
      environment: clean(body.environment) || spec.environment,
      label: clean(body.label) || spec.label,
      apiKeyId: 'gemini-api-key',
      apiSecret: clean(body.api_key),
    };
  }

  if (spec.provider === 'anthropic' || spec.provider === 'xai') {
    return {
      provider: spec.provider,
      environment: clean(body.environment) || spec.environment,
      label: clean(body.label) || spec.label,
      apiKeyId: spec.provider + '-api-key',
      apiSecret: clean(body.api_key),
    };
  }

  if (spec.provider === 'openai') {
    return {
      provider: spec.provider,
      environment: clean(body.environment) || spec.environment,
      label: clean(body.label) || spec.label,
      apiKeyId: 'openai-api-key',
      apiSecret: clean(body.api_key),
    };
  }

  if (spec.provider === 'facebook-pages') {
    const pageId = clean(body.page_id);
    if (!/^[0-9]{5,30}$/.test(pageId)) {
      throw new Error('facebook_page_id_invalid');
    }
    // The vault's stable credential reference is based on provider, environment
    // and label. Page-scoped labels prevent sealing Page B from overwriting Page A.
    // Never take the isolation label from an HTTP caller.
    return {
      provider: spec.provider,
      environment: 'live',
      label: 'evercraft-clip-page-' + pageId,
      apiKeyId: pageId,
      apiSecret: clean(body.page_access_token),
    };
  }
  if (spec.provider === 'linkedin-organization') {
    const organizationId=clean(body.organization_id);
    if (!/^[1-9][0-9]{1,19}$/.test(organizationId)) {
      throw new Error('linkedin_organization_id_invalid');
    }
    return {
      provider: spec.provider,
      environment: 'live',
      label: spec.label,
      apiKeyId: 'urn:li:organization:' + organizationId,
      apiSecret: clean(body.access_token),
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
