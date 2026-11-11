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

## Public listing observation and next release

The founder's OpenAI Platform screenshot from 2026-11-10 shows the **existing Evercraft LLC listing** marked **Listed publicly** at publication version **1.0.2**; MCP configured and domain verified, with no latest scan findings. That is **portal evidence**, not an independent fresh-account search/install. The current canonical package in this repository is **v1.0.6**, not yet confirmed as the public version.

Do not create a second public listing. The next account-side action is an **update to the existing public listing** with the tested v1.0.6 archive. Save the previous version and metadata, inspect the update's scan and review gates, publish only after provider checks, then verify the published version and a fresh external user invocation.

The source-truth record lives at `public-listing-observation-2026-11-10.json`. Repository readiness, a functioning owned MCP endpoint and a public portal label are different receipts. No customer-install count, organic recommendation or conversion can be inferred from them.

## Review doctrine

- Tool annotations must match real behavior.
- Public discovery is not Systemia execution authority.
- Installation alone does not grant private context.
- Public discovery is not payment authority.
- Do not submit a stale MCP snapshot.
- Scan Tools against the production endpoint immediately before submission.
- Provider publication or directory listing is not evidence of user conversion.
