# Systemia Merge Control

Systemia Merge Control protects a fast-moving repository without slowing independent work.

The coordination contract is intentionally simple:

1. Product and source work may move quickly in parallel.
2. A branch more than 20 commits behind `main` is stale and must refresh before admission.
3. Any branch behind `main` is held when both sides changed the same file or the same coordination-sensitive domain.
4. Older open pull requests receive deterministic right-of-way when two PRs overlap in a hot domain.
5. Volatile telemetry and generated-only state do not get their own product-code PR lane.
6. Five-minute monitoring may continue at five-minute cadence, but routine telemetry does not earn a five-minute commit to `main`.
7. `merge_group` is supported now so native GitHub Merge Queue can be enabled later without redesigning CI.

Coordination-sensitive domains currently include workflows, runtime/package surfaces, CHUM, RIVET, registries, conformance/public discovery, and the coordination layer itself.

The gate emits `artifacts/coordination/merge-admission.json` on every run so holds are evidence-backed rather than vibes.

## GitHub control-plane gap

The repository currently reports no repository rulesets, `allow_auto_merge=false`, and `allow_update_branch=false`. The connected GitHub integration can read rulesets but does not expose the repository-administration mutation required to create a native merge-queue ruleset. Until that admin-side setting is enabled, Systemia Merge Control provides freshness and overlap admission in CI and is already compatible with the `merge_group` event.
