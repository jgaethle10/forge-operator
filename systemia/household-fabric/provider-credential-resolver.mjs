import path from 'node:path';
import { ProviderCredentialVault } from '../evercraft-home/credential-vault.mjs';

function clean(value) {
  return String(value ?? '').trim();
}

function resolveStateDir(env = process.env) {
  const explicit = clean(env.EVERCRAFT_CREDENTIAL_STATE_DIR);
  if (explicit) return explicit;
  const identity = clean(env.EVERCRAFT_IDENTITY_STATE_DIR);
  return identity ? path.join(identity, 'provider-credentials') : '';
}

function readProviderSecret(vault, provider, credentialRef) {
  const ref = clean(credentialRef);
  if (!ref) return { state: 'credential_ref_missing', value: null };

  const metadata = vault.list({ provider }).find(row => row.credential_ref === ref);
  if (!metadata) {
    return {
      state: 'credential_ref_provider_mismatch_or_missing',
      value: null,
    };
  }

  const secret = vault.readSecret(ref);
  return {
    state: 'resolved',
    value: secret,
    metadata: {
      credential_ref: metadata.credential_ref,
      provider: metadata.provider,
      environment: metadata.environment,
      label: metadata.label,
      credential_fingerprint: metadata.credential_fingerprint,
      updated_at: metadata.updated_at,
    },
  };
}

export function resolveHouseholdProviderCredentials({
  env = process.env,
  credentialStateDir = resolveStateDir(env),
} = {}) {
  const googleRef = clean(env.HOUSEHOLD_GOOGLE_CREDENTIAL_REF);
  const krogerRef = clean(env.HOUSEHOLD_KROGER_CREDENTIAL_REF);

  if (!credentialStateDir) {
    return {
      google: {},
      kroger: {},
      safe_status: {
        vault_state: 'credential_vault_not_configured',
        google: googleRef ? 'blocked_vault_not_configured' : 'credential_ref_missing',
        kroger: krogerRef ? 'blocked_vault_not_configured' : 'credential_ref_missing',
      },
    };
  }

  const vault = new ProviderCredentialVault({ stateDir: credentialStateDir });
  const google = readProviderSecret(vault, 'google-places', googleRef);
  const kroger = readProviderSecret(vault, 'kroger', krogerRef);

  const googleValue = google.value && google.value.api_key_id === 'google-places-api-key'
    ? { api_key: clean(google.value.api_secret) }
    : {};

  const krogerValue = kroger.value
    ? {
        client_id: clean(kroger.value.api_key_id),
        client_secret: clean(kroger.value.api_secret),
      }
    : {};

  return {
    google: googleValue,
    kroger: krogerValue,
    safe_status: {
      vault_state: 'configured',
      google: google.state === 'resolved' && googleValue.api_key ? 'resolved' : google.state,
      kroger: kroger.state === 'resolved' && krogerValue.client_id && krogerValue.client_secret
        ? 'resolved'
        : kroger.state,
      google_credential: google.metadata || null,
      kroger_credential: kroger.metadata || null,
      secret_material_returned: false,
    },
  };
}

export function householdProviderConfigFromEnvironment(env = process.env) {
  const resolved = resolveHouseholdProviderCredentials({ env });
  const allowRaw = clean(env.HOUSEHOLD_ALLOW_RAW_PROVIDER_SECRETS).toLowerCase() === 'true';

  const google = {
    ...resolved.google,
    ...(allowRaw && !resolved.google.api_key && clean(env.HOUSEHOLD_GOOGLE_PLACES_API_KEY)
      ? { api_key: clean(env.HOUSEHOLD_GOOGLE_PLACES_API_KEY) }
      : {}),
    latitude: env.HOUSEHOLD_GOOGLE_CENTER_LAT || undefined,
    longitude: env.HOUSEHOLD_GOOGLE_CENTER_LONG || undefined,
    radius_meters: env.HOUSEHOLD_GOOGLE_RADIUS_METERS || undefined,
    max_results: env.HOUSEHOLD_GOOGLE_MAX_RESULTS || undefined,
  };

  const kroger = {
    ...resolved.kroger,
    ...(allowRaw && !resolved.kroger.client_id && clean(env.HOUSEHOLD_KROGER_CLIENT_ID)
      ? {
          client_id: clean(env.HOUSEHOLD_KROGER_CLIENT_ID),
          client_secret: clean(env.HOUSEHOLD_KROGER_CLIENT_SECRET),
        }
      : {}),
    zip_code: clean(env.HOUSEHOLD_KROGER_ZIP_CODE) || '98902',
    locations: (() => {
      const raw = clean(env.HOUSEHOLD_KROGER_LOCATIONS_JSON);
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })(),
    terms: clean(env.HOUSEHOLD_KROGER_TERMS)
      ? clean(env.HOUSEHOLD_KROGER_TERMS).split(',').map(clean).filter(Boolean)
      : undefined,
    limit_per_term: env.HOUSEHOLD_KROGER_LIMIT_PER_TERM || undefined,
  };

  return {
    google,
    kroger,
    priceOptions: {
      mileage_cost_cents: env.HOUSEHOLD_MILEAGE_COST_CENTS || undefined,
      time_value_cents_per_hour: env.HOUSEHOLD_TIME_VALUE_CENTS_PER_HOUR || undefined,
      friction_cents_per_step: env.HOUSEHOLD_FRICTION_CENTS_PER_STEP || undefined,
    },
    credential_status: {
      ...resolved.safe_status,
      raw_secret_override_enabled: allowRaw,
      secret_material_returned: false,
    },
  };
}
