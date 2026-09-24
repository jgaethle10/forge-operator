# Test results

PASS: v2 local fallback stress test
- 10,000 logical Saban agents
- 2 independent Node/Linux NodeSeed processes
- dynamic capacity discovery
- runtime lease negotiation
- 5,000 checkpointed agents rebound after primary capacity loss
- external capacity endpoints supported through --endpoints or EVERCRAFT_CAPACITY_ENDPOINTS
- no pre-enrollment requirement in the scheduler model

Receipt chain head:
ab99a2ce7f708c0eddc724d3605134ae67aa66c91d3f9abb29150bb4c6d1ea69

Scope note: the executed proof used the built-in local fallback. The code path for external capacity is wired, but this receipt does not claim a multi-provider field deployment.
