import fs from "node:fs";
import { ProviderCredentialVault } from "../evercraft-home/credential-vault.mjs";

function first(env, names) {
  for (const name of names) {
    const value = String(env?.[name] || "").trim();
    if (value) return value;
  }
  return "";
}

function vaultSecrets(env) {
  const stateDir = String(
    env?.RAVEN_PROVIDER_CREDENTIAL_STATE_DIR ||
    env?.EVERCRAFT_CREDENTIAL_STATE_DIR ||
    ""
  ).trim();
  if (!stateDir || !fs.existsSync(stateDir)) return { kaggle: null, numerai: null };
  try {
    const vault = new ProviderCredentialVault({ stateDir });
    const kaggleMeta = vault.list({ provider: "kaggle" })[0] || null;
    const numeraiMeta = vault.list({ provider: "numerai" })[0] || null;
    const kaggleRaw = kaggleMeta ? vault.readSecret(kaggleMeta.credential_ref) : null;
    const numeraiRaw = numeraiMeta ? vault.readSecret(numeraiMeta.credential_ref) : null;
    return {
      kaggle: kaggleRaw?.api_secret
        ? { mode: "bearer", access_token: String(kaggleRaw.api_secret), source: "owned_vault" }
        : null,
      numerai: numeraiRaw?.api_key_id && numeraiRaw?.api_secret
        ? {
            public_id: String(numeraiRaw.api_key_id),
            secret_key: String(numeraiRaw.api_secret),
            source: "owned_vault",
          }
        : null,
    };
  } catch {
    return { kaggle: null, numerai: null };
  }
}

export function resolveCompetitionProviderSecrets(env = process.env) {
  const kaggleAccessToken = first(env, [
    "RAVEN_KAGGLE_ACCESS_TOKEN",
    "KAGGLE_ACCESS_TOKEN",
    "KAGGLE_API_TOKEN",
  ]);
  const kaggleUsername = first(env, ["RAVEN_KAGGLE_USERNAME", "KAGGLE_USERNAME"]);
  const kaggleKey = first(env, ["RAVEN_KAGGLE_KEY", "KAGGLE_KEY"]);

  const numeraiPublicId = first(env, ["RAVEN_NUMERAI_PUBLIC_ID", "NUMERAI_PUBLIC_ID"]);
  const numeraiSecretKey = first(env, ["RAVEN_NUMERAI_SECRET_KEY", "NUMERAI_SECRET_KEY"]);
  const owned = vaultSecrets(env);

  return {
    kaggle: kaggleAccessToken
      ? { mode: "bearer", access_token: kaggleAccessToken, source: "runtime_binding" }
      : kaggleUsername && kaggleKey
        ? { mode: "basic", username: kaggleUsername, key: kaggleKey, source: "runtime_binding" }
        : owned.kaggle,
    numerai: numeraiPublicId && numeraiSecretKey
      ? { public_id: numeraiPublicId, secret_key: numeraiSecretKey, source: "runtime_binding" }
      : owned.numerai,
  };
}

export function competitionProviderSecretStatus(secrets) {
  return {
    schema: "evercraft.raven.competition-provider-secret-status.v1",
    secret_boundary: "raven_nexus",
    kaggle_configured: Boolean(secrets?.kaggle),
    kaggle_auth_mode: secrets?.kaggle?.mode || null,
    numerai_configured: Boolean(secrets?.numerai),
    secret_values_exposed: false,
  };
}
