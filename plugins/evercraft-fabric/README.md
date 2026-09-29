# Evercraft plugin for ChatGPT and Codex

This package is the canonical OpenAI-facing front door for the Evercraft/Systemia capability fabric.

The intended public listing name is **Evercraft**. Users should not need to know product names before asking for help. The plugin starts from the problem, routes to the smallest truthful capability, prefers a verified specialist MCP when available, and keeps consequential actions behind authorization and confirmation.

## Current transport

The package currently points at the receipt-backed universal Evercraft Machine Commerce MCP:

`https://evercraft-ai-suite-08c4d2b8.base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/machineCommerceMcp`

That is a compatibility transport, not the long-term authority boundary. Evercraft Fabric also has an Evercraft-owned read-only MCP directory implemented in `systemia/mcp/fabric-directory.mjs` and served by the specialist handoff runtime. The package must move to that owned public HTTPS route only after the Yard produces a verified stable route receipt. Do not invent the future URL or claim that migration has happened before receipt.

## Public-directory status

Source package state: **prepared for OpenAI testing and submission, not yet observed as a published public plugin**.

Public publication still requires the account-side OpenAI submission flow: verified publisher identity, Apps Management write access, domain verification for the submitted MCP host, successful tool scan, required test cases, review approval, and explicit publication.

## Why one umbrella plugin

Evercraft already contains many specialist packages. The umbrella plugin prevents the user from having to install or understand the portfolio first. It should route into specialists when they are verified and available, while keeping the universal path as the fallback.

## Truth boundary

Repository readiness is not provider pickup. Do not claim ChatGPT or Codex can discover this plugin from the public directory until the directory listing is independently observed.
