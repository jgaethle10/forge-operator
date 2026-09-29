# Evercraft plugin for ChatGPT and Codex

This package is the canonical OpenAI-facing front door for the Evercraft/Systemia capability fabric.

The intended public listing name is **Evercraft**. Users should not need to know product names before asking for help. The plugin starts from the problem, routes to the smallest truthful capability, prefers a verified specialist MCP when available, and keeps consequential actions behind authorization and confirmation.

## Current transport

Until an owned external canary passes, the checked-in package keeps the receipt-backed universal Evercraft Machine Commerce MCP as a compatibility transport. It is not the long-term authority boundary.

Evercraft Fabric has an Evercraft-owned read-only MCP directory implemented in `systemia/mcp/fabric-directory.mjs` and served by the specialist handoff runtime. When the external Public Edge canary proves trusted HTTPS, field enrollment, same-device binding, MCP initialization, tool discovery, safe tool calls, and read-only authority, `scripts/promote-openai-owned-fabric.mjs` rewrites the package to the verified owned `/mcp` origin and produces an OpenAI promotion receipt plus upload ZIP.

OpenAI treats a change of MCP origin as a new plugin submission rather than a normal version update. The cutover automation therefore prepares the owned-origin submission packet but does not claim provider approval or publication.

## Public-directory status

Source package state: **prepared for OpenAI testing and submission, not yet observed as a published public plugin**.

Public publication still requires the account-side OpenAI submission flow: verified publisher identity, Apps Management write access, domain verification for the submitted MCP host, successful tool scan, required test cases, review approval, and explicit publication.

## Why one umbrella plugin

Evercraft already contains many specialist packages. The umbrella plugin prevents the user from having to install or understand the portfolio first. It should route into specialists when they are verified and available, while keeping the universal path as the fallback.

## Truth boundary

Repository readiness is not provider pickup. Do not claim ChatGPT or Codex can discover this plugin from the public directory until the directory listing is independently observed.
