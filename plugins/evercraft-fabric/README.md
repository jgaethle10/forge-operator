# Evercraft plugin for ChatGPT and Codex

This package is the canonical public OpenAI-facing Evercraft plugin.

Version 1.1.0 is intentionally focused on useful standalone work rather than portfolio advertising. The submitted MCP endpoint is:

`https://fabric.systemiacommandcenters.com/mcp/openai`

It exposes one public tool, `inspect_public_website`, which performs bounded read-only inspection of a public website the user owns, administers, or has permission to review.

## Public behavior

The inspection can report bounded signals such as HTTP status, page title, meta description, viewport and robots metadata, canonical URL, heading counts, image alt-text gaps, form count, JSON-LD presence, and a basic contact-signal observation.

It rejects private/local/reserved targets, embedded credentials, nonstandard ports, unsafe redirects, oversized responses, and unsupported content types. It does not modify websites and does not represent its output as a full crawl, Core Web Vitals lab test, accessibility certification, security audit, penetration test, or ranking guarantee.

The current public plugin contains no digital-service checkout or paid-offer promotion.

## Internal Fabric remains broader

Evercraft's internal and human-facing Fabric surfaces can still maintain the broader capability catalog, commercial metadata, and specialist routing. Those surfaces are separate from the purpose-specific OpenAI MCP submitted for public review.

The public plugin can expand later by adding real capabilities as explicit, independently reviewable tools rather than exposing a generic dispatcher.

## Current transport state

The package points to the Evercraft-owned `/mcp/openai` endpoint and the legacy Base44 compatibility transport is inactive. The latest external canary on October 1, 2026 timed out at public TCP 80/443 after DNS resolved correctly, so the endpoint requires ingress repair and a fresh passing canary before v1.1.0 is treated as submission-ready.

## Truth boundary

Repository readiness, a private installation, an old canary receipt, review approval, and publication are separate states. Do not claim public ChatGPT/Codex discovery until the current provider flow and independent directory observation prove it.
