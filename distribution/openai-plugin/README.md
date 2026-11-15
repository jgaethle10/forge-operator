# OpenAI public plugin submission packet

This directory is the canonical account-side submission packet for the **Evercraft** public plugin.

The product-facing source package lives at `plugins/evercraft-fabric/`. The public listing should present Evercraft as one problem-first front door into the broader Evercraft/Systemia capability fabric, not as a separate Machine Commerce product.

## Current transport

The submission packet now references the Evercraft-owned Fabric MCP at `https://fabric.systemiacommandcenters.com/mcp`. The owned route has recorded public HTTPS and external-canary evidence, while the legacy Base44 transport is retained only as inactive compatibility history.

The owned Evercraft Fabric MCP is implemented in `systemia/mcp/fabric-directory.mjs` and served by the Fabric runtime. Provider review, approval, publication, and directory pickup remain external states and must never be inferred from source readiness alone.

## Prepared

- canonical listing copy for **Evercraft**
- current universal remote MCP URL
- website/support/privacy/terms URLs
- starter prompts
- at least five positive review cases
- at least three negative review cases
- current commercial and safety boundaries
- matching product package under `plugins/evercraft-fabric/`

## Public release timeline

- **November 10, 2026:** OpenAI Platform founder screenshot showed the existing Evercraft LLC listing published at **v1.0.2**, with configured owned MCP, verified domain and a scan reporting no findings. See `public-listing-observation-2026-11-10.json`.
- **November 10, 2026:** Work uploaded the tested **v1.0.6** ZIP to that existing listing and reported clean package checks. Publisher attestations were completed by the owner and the update entered review. The prior public release remained available.
- **November 11, 2026:** The publisher reported **v1.0.6 published** on the existing listing. See `public-release-report-2026-11-11.json`. This is a direct publisher status report, *not* an independently retrieved OpenAI Platform receipt. The known source ZIP checksum is recorded, not a claim of downloads or usage.

**Remaining external validation:** capture the public listing URL and provider version readback; search/install using a separate account with no personal Evercraft plugins; call a read-only discovery tool and record the outcome. External agent-plugins source-version records are not substitutes for OpenAI's published version. Do not infer sales or organic recommendations.

## Review doctrine

- Tool annotations must match real behavior.
- Public discovery is not Systemia execution authority.
- Installation alone does not grant private context.
- Public discovery is not payment authority.
- Do not submit a stale MCP snapshot.
- Scan Tools against the production endpoint immediately before submission.
- Provider publication or directory listing is not evidence of user conversion.
