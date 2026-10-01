# Evercraft plugin for ChatGPT and Codex

This package is the canonical OpenAI-facing front door for the Evercraft/Systemia capability fabric.

The intended public listing name is **Evercraft**. Users should not need to know product names before asking for help. The plugin starts from the problem, routes to the smallest truthful capability, prefers a verified specialist MCP when available, and keeps consequential actions behind authorization and confirmation.

## Current transport

The package now points directly to the verified Evercraft-owned Fabric MCP:

`https://fabric.systemiacommandcenters.com/mcp`

The legacy Base44 compatibility transport is inactive for the OpenAI package. Evercraft Fabric is implemented by `systemia/mcp/fabric-directory.mjs` and exposes three read-only discovery/connection tools with explicit MCP safety annotations. Live ChatGPT testing has confirmed the owned Fabric can list capabilities, match natural-language problems, and return public connection options without creating payments or external side effects.

## Current ChatGPT state

Evercraft is installed privately in ChatGPT for the owner account and is usable there through the owned Fabric MCP. Private installation is not public-directory publication.

The canonical package version for the next public submission is **v1.0.4**. It includes the owned MCP endpoint, public Evercraft support/privacy/terms surfaces, directory artwork, the problem-first routing skill, exactly five positive and three negative review cases, and the reviewer walkthrough URL.

## Public-directory status

Public-directory state remains **not proven** until the account-side OpenAI Platform flow is completed and the resulting listing is independently observed.

The remaining provider-side steps are: upload the canonical ZIP at the OpenAI Platform Plugins page, select the verified Evercraft LLC developer identity, satisfy Apps Management access, complete the portal-generated domain challenge and MCP scan, confirm the imported review materials, submit for review, explicitly publish after approval, and then capture a directory discovery receipt.

## Why one umbrella plugin

Evercraft already contains many specialist packages. The umbrella plugin prevents the user from having to install or understand the portfolio first. It routes into specialists when they are verified and available, while keeping the universal Fabric path as the fallback.

## Truth boundary

Repository readiness and private installation are not public provider pickup. Do not claim ChatGPT or Codex can discover Evercraft from the public directory until an independent directory observation proves it.
