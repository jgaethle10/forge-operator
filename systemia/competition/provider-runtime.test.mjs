import test from "node:test";
import assert from "node:assert/strict";
import { runCompetitionProviderProbes, probeKaggle, probeNumerai } from "./provider-runtime.mjs";
import { resolveCompetitionProviderSecrets, competitionProviderSecretStatus } from "../raven/provider-secret-boundary.mjs";

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("Raven secret boundary supports bearer Kaggle and Numerai without exposing values", () => {
  const env = {
    RAVEN_KAGGLE_ACCESS_TOKEN: "KGAT_secret_test_value",
    RAVEN_NUMERAI_PUBLIC_ID: "numerai-public",
    RAVEN_NUMERAI_SECRET_KEY: "numerai-secret",
  };
  const secrets = resolveCompetitionProviderSecrets(env);
  assert.equal(secrets.kaggle.mode, "bearer");
  assert.equal(secrets.numerai.public_id, "numerai-public");
  const status = competitionProviderSecretStatus(secrets);
  assert.deepEqual(status, {
    schema: "evercraft.raven.competition-provider-secret-status.v1",
    secret_boundary: "raven_nexus",
    kaggle_configured: true,
    kaggle_auth_mode: "bearer",
    numerai_configured: true,
    secret_values_exposed: false,
  });
  const serialized = JSON.stringify(status);
  assert.equal(serialized.includes("KGAT_secret_test_value"), false);
  assert.equal(serialized.includes("numerai-secret"), false);
});

test("Kaggle probe uses Raven credential and emits sanitized read-only receipt", async () => {
  let seenAuthorization = "";
  const fetchImpl = async (url, init) => {
    assert.match(String(url), /\/api\/v1\/competitions\/list/);
    seenAuthorization = init.headers.authorization;
    assert.equal(init.method, "GET");
    return jsonResponse(200, [{ ref: "one" }, { ref: "two" }]);
  };

  const receipt = await probeKaggle({
    env: { RAVEN_KAGGLE_ACCESS_TOKEN: "KGAT_super_secret" },
    fetchImpl,
  });

  assert.equal(seenAuthorization, "Bearer KGAT_super_secret");
  assert.equal(receipt.state, "authenticated_listing_verified");
  assert.equal(receipt.item_count, 2);
  assert.equal(receipt.submission_attempted, false);
  assert.equal(receipt.base44_used, false);
  assert.equal(receipt.public_fabric_used, false);
  assert.equal(JSON.stringify(receipt).includes("KGAT_super_secret"), false);
});

test("Kaggle probe supports legacy username/key binding without persisting it", async () => {
  let seenAuthorization = "";
  const fetchImpl = async (_url, init) => {
    seenAuthorization = init.headers.authorization;
    return jsonResponse(200, []);
  };
  const receipt = await probeKaggle({
    env: {
      RAVEN_KAGGLE_USERNAME: "evercraft",
      RAVEN_KAGGLE_KEY: "legacy-secret-key",
    },
    fetchImpl,
  });
  assert.ok(seenAuthorization.startsWith("Basic "));
  assert.equal(receipt.state, "authenticated_listing_verified");
  assert.equal(JSON.stringify(receipt).includes("legacy-secret-key"), false);
});

test("Numerai probe authenticates with token format and never enables staking", async () => {
  let seenAuthorization = "";
  let query = "";
  const fetchImpl = async (_url, init) => {
    seenAuthorization = init.headers.authorization;
    query = JSON.parse(init.body).query;
    return jsonResponse(200, {
      data: {
        account: { username: "evercraft-proof" },
        rounds: [{ number: 999 }],
      },
    });
  };

  const receipt = await probeNumerai({
    env: {
      RAVEN_NUMERAI_PUBLIC_ID: "public-id",
      RAVEN_NUMERAI_SECRET_KEY: "secret-key",
    },
    fetchImpl,
  });

  assert.equal(seenAuthorization, "Token public-id$secret-key");
  assert.match(query, /account \{ username \}/);
  assert.match(query, /rounds\(tournament: 8/);
  assert.equal(receipt.state, "authenticated_listing_verified");
  assert.equal(receipt.account_observed, true);
  assert.equal(receipt.staking_attempted, false);
  assert.equal(JSON.stringify(receipt).includes("secret-key"), false);
});

test("provider suite holds safely with no Raven credentials", async () => {
  let calls = 0;
  const result = await runCompetitionProviderProbes({
    env: {},
    fetchImpl: async () => {
      calls += 1;
      throw new Error("network should not be called");
    },
  });

  assert.equal(calls, 0);
  assert.equal(result.summary.state, "held");
  assert.equal(result.summary.held_count, 2);
  assert.equal(result.submission_authority_enabled, false);
  assert.equal(result.staking_authority_enabled, false);
  assert.deepEqual(result.route, ["systemia", "raven_nexus", "provider_api"]);
});

test("provider suite distinguishes rejected auth from missing credentials", async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes("kaggle.com")) return jsonResponse(401, { message: "Unauthorized" });
    return jsonResponse(403, { errors: [{ message: "Forbidden" }] });
  };

  const result = await runCompetitionProviderProbes({
    env: {
      RAVEN_KAGGLE_ACCESS_TOKEN: "bad-token",
      RAVEN_NUMERAI_PUBLIC_ID: "bad-public",
      RAVEN_NUMERAI_SECRET_KEY: "bad-secret",
    },
    fetchImpl,
  });

  assert.equal(result.summary.state, "degraded");
  assert.equal(result.summary.failed_count, 2);
  assert.ok(result.providers.every((row) => row.state === "auth_rejected"));
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("bad-token"), false);
  assert.equal(serialized.includes("bad-secret"), false);
});
