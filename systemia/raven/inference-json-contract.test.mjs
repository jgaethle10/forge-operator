import test from "node:test";
import assert from "node:assert/strict";
import {
  createInferenceEngine,
  startRavenInferenceGateway,
} from "./inference-gateway.mjs";

const mockOllama = (responseText, requests) => async (url, init) => {
  requests.push({ url: String(url), request: JSON.parse(init.body) });
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    async json() { return { model: "fixture-model", response: responseText }; },
  };
};

test("default Raven Ollama inference remains plain text without format flags", async () => {
  const requests = [];
  const engine = createInferenceEngine({
    provider: "ollama",
    model: "fixture-model",
    fetchImpl: mockOllama("ordinary prose", requests),
  });
  const result = await engine.infer({
    request_id: "text-1", role: "qa", input: "Describe a bounded result.",
  });
  assert.equal(result.text, "ordinary prose");
  assert.equal(result.output_format, "text");
  assert.equal(result.structured_output_validated, false);
  assert.equal(requests.length, 1);
  assert.equal(Object.hasOwn(requests[0].request, "format"), false);
  assert.equal(requests[0].request.stream, false);
});

test("opt-in JSON passes an Ollama format contract and records validation", async () => {
  const requests = [];
  const engine = createInferenceEngine({
    provider: "ollama",
    model: "fixture-model",
    fetchImpl: mockOllama('{"status":"ok","items":[1,2]}', requests),
  });
  const result = await engine.infer({
    request_id: "json-1", role: "qa", input: "Provide a JSON object.",
    response_format: "json",
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "http://127.0.0.1:11434/api/generate");
  assert.equal(requests[0].request.format, "json");
  assert.equal(result.output_format, "json");
  assert.equal(result.structured_output_validated, true);
  assert.equal(result.receipt.output_format, "json");
  assert.equal(result.receipt.structured_output_validated, true);
  assert.equal(result.receipt.external_side_effects_authorized, false);
  assert.match(result.provider_receipt, /^sha256:[0-9a-f]{64}$/);
});

test("invalid and non-object JSON fail closed rather than being repaired", async () => {
  for (const [response, reason] of [
    ['```json\n{"ok":true}\n```', "raven_inference_json_invalid"],
    ['Here is your result: {"ok":true}', "raven_inference_json_invalid"],
    ['[{"ok":true}]', "raven_inference_json_object_required"],
    ['null', "raven_inference_json_object_required"],
    ['42', "raven_inference_json_object_required"],
    ['{"ok":true,}', "raven_inference_json_invalid"],
    ['{"message":"raw\nnewline"}', "raven_inference_json_invalid"],
  ]) {
    const requests = [];
    const engine = createInferenceEngine({
      provider: "ollama",
      model: "fixture-model",
      fetchImpl: mockOllama(response, requests),
    });
    await assert.rejects(
      engine.infer({
        request_id: "bad-json", role: "qa", input: "One JSON object.",
        response_format: "json",
      }),
      { message: reason },
    );
    assert.equal(requests.length, 1);
  }
});

test("oversized structured replies fail closed before parsing", async () => {
  const requests = [];
  const engine = createInferenceEngine({
    provider: "ollama", model: "fixture-model",
    fetchImpl: mockOllama('{"large":"' + "x".repeat(50001) + '"}', requests),
  });
  await assert.rejects(
    engine.infer({
      request_id: "overlong", role: "qa", input: "test", response_format: "json",
    }),
    { message: "raven_inference_json_too_large" },
  );
  assert.equal(requests.length, 1);
});

test("unsupported output format and hosted JSON are denied before model calls", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; throw Error("model_must_not_be_contacted"); };
  const local = createInferenceEngine({
    provider: "ollama", model: "fixture-model", fetchImpl,
  });
  await assert.rejects(
    local.infer({
      request_id: "bad-format", role: "qa", input: "test",
      response_format: "yaml",
    }),
    { message: "raven_inference_output_format_invalid" },
  );
  const hosted = createInferenceEngine({
    provider: "openai", model: "fixture-model", fetchImpl,
  });
  await assert.rejects(
    hosted.infer({
      request_id: "hosted-json", role: "qa", input: "test",
      response_format: "json",
    }),
    { message: "raven_inference_json_provider_not_supported" },
  );
  assert.equal(calls, 0);
});

test("authenticated gateway validates JSON and blocks malformed model replies", async () => {
  const token = "raven-local-json-contract-proof-token-0123456789012345";
  let nextReply = '{"approved":false,"action":"none"}';
  const requests = [];
  const runtime = await startRavenInferenceGateway({
    port: 0, controlToken: token, provider: "ollama", model: "fixture-model",
    fetchImpl: async (url, init) => mockOllama(nextReply, requests)(url, init),
  });
  try {
    const makeRequest = () => fetch(runtime.url + "/v1/infer", {
      method: "POST",
      headers: {
        authorization: "Bearer " + token,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        schema: "evercraft.raven.inference.request.v1",
        request_id: "gateway-json",
        role: "qa", input: "One bounded JSON result.",
        response_format: "json",
        constraints: {
          internal_analysis_only: true,
          no_external_actions: true,
          no_credential_return: true,
        },
      }),
    });
    const valid = await makeRequest();
    assert.equal(valid.status, 200);
    const pass = await valid.json();
    assert.equal(pass.status, "completed");
    assert.equal(pass.structured_output_validated, true);
    assert.equal(pass.receipt, undefined);
    assert.equal(pass.external_side_effects_authorized, false);
    assert.equal(JSON.stringify(pass).includes(token), false);

    nextReply = "not valid JSON";
    const invalid = await makeRequest();
    assert.equal(invalid.status, 409);
    const hold = await invalid.json();
    assert.equal(hold.status, "blocked");
    assert.equal(hold.blocked_reason, "raven_inference_json_invalid");
    assert.equal(hold.external_side_effects_authorized, false);
    assert.equal(Object.hasOwn(hold, "provider_receipt"), false);
    assert.equal(requests.length, 2);
    assert.equal(requests.every(x => x.request.format === "json"), true);
  } finally {
    await runtime.close();
  }
});
