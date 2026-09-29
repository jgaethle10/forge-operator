# Evercraft OpenAI plugin submission

## Intended listing

- Name: **Evercraft**
- Developer: **Evercraft LLC**
- Category: **Business**
- Short description: **Find and use the right Evercraft capability from one connected front door.**
- Source package: `plugins/evercraft-fabric/`

Evercraft should be submitted as the umbrella front door. Specialist plugins remain useful direct routes, but the user should not need to know the portfolio before asking for help.

## Source readiness

The package contains:

- portable and Codex/OpenAI plugin manifests;
- a remote MCP configuration;
- the problem-first Evercraft routing skill;
- privacy, terms, and support documents;
- an explicit positive/negative review test matrix;
- an owned read-only Evercraft Fabric MCP contract;
- automated tests for package invariants and the owned Fabric runtime.

## Transport truth

The checked-in plugin configuration currently uses the live universal Evercraft Machine Commerce MCP as a compatibility transport.

Evercraft's owned Fabric MCP is implemented by `systemia/mcp/fabric-directory.mjs` and is served by the specialist-handoff runtime at a configurable `/mcp` path. The Yard already has the deployment and OpenAI challenge wiring needed to expose that runtime.

Do not replace the plugin MCP URL with a guessed hostname. Cut over only after the Yard produces a verified stable public HTTPS route receipt and an external probe confirms `initialize`, `tools/list`, a safe tool call, and the OpenAI domain-verification challenge.

## OpenAI account-side gates

Before claiming public ChatGPT availability, the publishing organization must complete the current OpenAI submission flow:

1. Verify the publisher identity and organization.
2. Confirm Apps Management write access.
3. Add the production remote MCP endpoint and complete the OpenAI tool scan.
4. Verify ownership of the MCP host using OpenAI's required domain challenge.
5. Supply public website, privacy, terms, and support URLs that are reachable outside GitHub source views if the review requires branded public pages.
6. Enter at least five positive and three negative test cases. The canonical test matrix is `openai-submission.json`.
7. Submit for review.
8. After approval, explicitly publish the plugin.
9. Independently verify exact-name directory discovery and a brand-blind problem-first query before changing any receipt to `published`.

Submission is not publication. Approval is not publication. Repository packaging is not provider pickup.

## Test-case rule

The owned Fabric endpoint exposes:

- `match_evercraft_capability`
- `list_evercraft_capabilities`
- `get_evercraft_connection_options`

All three are read-only and non-transactional.

When the submission is pointed at the owned Fabric endpoint, OpenAI review expectations should reference those exact tool names. If the compatibility Machine Commerce endpoint is submitted before owned-route cutover, use OpenAI's live Scan Tools result to populate the exact current tool names instead of assuming they match the owned Fabric contract.

## Publication receipt

A future publication receipt should capture at minimum:

- OpenAI plugin/listing identifier;
- published listing name and version;
- submitted MCP origin;
- verified domain;
- OpenAI review/approval state;
- publication timestamp;
- directory discovery observation;
- one successful read-only invocation observation;
- source commit SHA;
- evidence URLs or screenshots.

Until those fields are observed, public-directory status remains **not proven**.
