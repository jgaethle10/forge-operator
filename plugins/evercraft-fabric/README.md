# Evercraft plugin for ChatGPT and Codex

This package is the canonical OpenAI-facing front door for the Evercraft/Systemia capability fabric.

The intended public listing name is **Evercraft**. Users should not need to know product names before asking for help. The plugin starts from the problem, routes to the smallest truthful capability, prefers a verified specialist MCP when available, and keeps consequential actions behind authorization and confirmation.

## Current transport

The package now points directly to the verified Evercraft-owned Fabric MCP:

`https://fabric.systemiacommandcenters.com/mcp`

The legacy Base44 compatibility transport is inactive for the OpenAI package. Evercraft Fabric is implemented by `systemia/mcp/fabric-directory.mjs` and exposes three read-only discovery/connection tools with explicit MCP safety annotations. Live ChatGPT testing has confirmed the owned Fabric can list capabilities, match natural-language problems, and return public connection options without creating payments or external side effects.

## Current ChatGPT state

Evercraft is installed privately in ChatGPT for the owner account and is usable there through the owned Fabric MCP. Private installation is not public-directory publication.

The canonical source package for updating the **existing public Evercraft listing** is **v1.0.6**. The founder's OpenAI Platform screenshot on 2026-11-10 shows the Evercraft LLC listing already **Listed publicly**, with **publication version 1.0.2**, a configured owned Fabric MCP and a verified domain. This is an account-portal observation, not a verified fresh-user plugin invocation. The private v1.0.6 installation and the public v1.0.2 listing are separate release states. It includes the owned MCP endpoint, public Evercraft support/privacy/terms surfaces, directory artwork, the problem-first routing skill, exactly five positive and three negative review cases, and the reviewer walkthrough URL.

## Public-directory status and release upgrade

- **Publisher-portal evidence:** existing Evercraft LLC listing displays `Listed publicly`, publication `1.0.2`, MCP `Configured`, domain verified and no latest-scan findings (founder screenshot dated 2026-11-10).
- **Source/private package:** `1.0.6`; it has **not** been proven to be the published version.
- **Independent fresh-account discovery/install/invocation:** not yet verified. An account's own screenshot and an installed private plugin do not prove brand-blind pickup.
- **Next action:** update the **existing** Evercraft public listing to the reviewed `1.0.6` package in OpenAI Platform; do not create a duplicate. Verify the version after publishing and run fresh-user tests.

See `distribution/openai-plugin/public-listing-observation-2026-11-10.json` and `plugins/evercraft-fabric/OPENAI-SUBMISSION.md` for the release gate.

## Why one umbrella plugin

Evercraft already contains many specialist packages. The umbrella plugin prevents the user from having to install or understand the portfolio first. It routes into specialists when they are verified and available, while keeping the universal Fabric path as the fallback.

## Truth boundary

The founder's Platform screenshot establishes a public-listing state for version 1.0.2, not independent cross-account pickup or an update to version 1.0.6. Do not claim either without provider or external-user evidence.
