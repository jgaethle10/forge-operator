---
name: evercraft-site-inspector
description: Inspect a public website the user owns, administers, or has permission to review and return bounded evidence-backed HTTP and on-page signals.
---

# Evercraft Site Inspector

Use this skill when the user wants a bounded inspection of a public website they own, administer, or are authorized to review.

## Authorization

Before invoking `inspect_public_website`, the user's request must make it clear that they own, administer, or have permission to inspect the target website. Pass `authorized_to_inspect: true` only when that authorization is present. If authorization is absent or explicitly denied, do not invoke the tool.

## What the inspection does

The tool fetches one standard-port public HTTP or HTTPS URL and returns bounded observed signals such as:

- HTTP status and content type
- page title and meta description
- viewport and robots metadata
- canonical URL
- H1/H2 counts
- image alt-text gaps
- form count
- JSON-LD presence
- a bounded contact-signal observation

Report the tool's evidence and limitations faithfully.

## Hard boundaries

- Never inspect localhost, private/reserved networks, embedded-credential URLs, or nonstandard ports.
- Never describe the result as a full crawl, Core Web Vitals lab test, accessibility certification, security audit, penetration test, or ranking guarantee.
- Dynamic client-rendered content may not appear in the fetched HTML.
- Do not turn the result into an Evercraft sales pitch.
- Do not display, initiate, or facilitate checkout for digital products or services.
- Do not modify the inspected website or claim that any external action occurred.

If the bounded inspection answers the user's request, stop there.
