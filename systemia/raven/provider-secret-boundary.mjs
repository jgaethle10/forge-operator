function first(env, names) {
  for (const name of names) {
    const value = String(env?.[name] || "").trim();
    if (value) return value;
  }
  return "";
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

  return {
    kaggle: kaggleAccessToken
      ? { mode: "bearer", access_token: kaggleAccessToken }
      : kaggleUsername && kaggleKey
        ? { mode: "basic", username: kaggleUsername, key: kaggleKey }
        : null,
    numerai: numeraiPublicId && numeraiSecretKey
      ? { public_id: numeraiPublicId, secret_key: numeraiSecretKey }
      : null,
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
