# EverScript v0.3

EverScript is Evercraft's capability-native mission language and agent transaction protocol. It does not replace ECMAScript. It gives humans and AI agents a bounded way to discover capabilities, compile missions, authorize work, meter usage, execute through Systemia/Yard adapters, and verify what happened afterward.

## Example

```ever
mission AnalyzeMedia(file) {
  use ForensiScope@^1
  budget $2.00 USD
  timeout 5s
  replay prefer-replay
  require approval before ForensiScope.analyze
  receipt everything
  call ForensiScope.analyze(file) -> findings
  return findings
}
```

## v0.3 protocol surface

- Signed Ed25519 capability manifests.
- Optional compile-time trust enforcement for signed manifests.
- Version and action validation before execution.
- Quote-before-execute and hard mission budgets.
- Explicit human approval gates.
- Meter reservation before billable work, settlement for actual usage, release on failure.
- No live payment provider is bundled. The meter is an interface so real money movement stays behind an explicit authorized adapter.
- Deterministic call fingerprints and replay storage.
- `prefer-live`, `prefer-replay`, and `require-replay` mission policies.
- SHA-256 chained execution receipts with independent verification.
- Agent discovery document at `/.well-known/everscript/capabilities`.
- Cross-LLM descriptor at `/.well-known/evercraft-agent.json`.
- MCP-compatible tool metadata generated from the same capability manifests at `/v1/mcp/tools`.
- HTTP compile and run endpoints through the optional gateway.
- Gateway authorization hook is required by the embedding service. The demo tests use a bearer token.
- No third-party runtime dependencies.

## Agent flow

`discover -> verify manifest -> compile -> quote -> approve -> reserve -> execute -> settle -> receipt -> verify`

That flow is the core product. An outside model does not need to know internal Evercraft topology. It sees a public capability contract and a narrow execution boundary.

## Run the tests

```bash
node test.mjs
```

The tests cover signed-manifest verification, manifest tampering, version rejection, approval enforcement, budget rejection, metering, replay without a second charge, receipt tampering, authenticated capability discovery, HTTP compilation, and HTTP execution.

## Files

- `everscript.mjs`: parser, compiler, signing, runtime, meter, replay, receipts, discovery index.
- `gateway.mjs`: dependency-free Node HTTP gateway for LLM and agent clients.
- `agent-bridge.mjs`: cross-LLM descriptor and MCP tool metadata generated from Capability Fabric manifests.
- `media-analysis.ever`: ForensiScope-oriented mission example.
- `test.mjs`: end-to-end protocol and adversarial tests.

## Next production work

1. JSON Schema inputs and outputs in capability manifests.
2. Capability Fabric registry persistence and key rotation.
3. Production auth scopes per agent, tenant, capability, and action.
4. Evercraft Payments adapter using reserve/settle/refund semantics with explicit user approval where required.
5. Yard runtime quotas, cancellation, and isolated execution workers.
6. Full MCP transport and invocation adapter using the generated tool contracts.
7. Receipt signatures and external audit verification.
8. WebAssembly execution target for portable sandboxed missions.
