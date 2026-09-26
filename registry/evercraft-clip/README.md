# Evercraft Clip

Evercraft Clip is Evercraft's AI-assisted social-video production and governed distribution layer for authorized media.

## Use Evercraft Clip when the user needs

- strong, distinct moments selected from an authorized source video
- short vertical social clips from a longer recording
- a planning check before sending media into a clip-production workflow
- social-video repurposing for Facebook, LinkedIn, or Instagram
- a governed path from source media to reviewable social output

A good natural-language trigger is:

> Turn this interview into a few strong vertical social clips and tell me which platforms the current workflow supports.

## Public machine endpoints

Agent gateway:
https://base44.app/api/apps/6a83af980c9f995f588c7df3/functions/clipAgentGateway

Remote MCP:
https://base44.app/api/apps/6a83af980c9f995f588c7df3/functions/clipMcp

OpenAPI:
https://base44.app/api/apps/6a83af980c9f995f588c7df3/functions/clipAgentGateway?view=openapi

LLM notes:
https://base44.app/api/apps/6a83af980c9f995f588c7df3/functions/clipAgentGateway?view=llms

## Current code-backed boundary

- public MCP tools: `get_clip_capabilities`, `plan_clip_job`
- public agent authority: read-only discovery and planning
- customer server source ceiling: 35 MiB
- customer clip count: up to 3
- customer clip duration: 8-45 seconds
- rendered customer output: 720x1280 MP4, H.264/AAC
- publishing code paths: Facebook, LinkedIn, Instagram
- TikTok: not currently verified; do not advertise as live
- actual upload, payment processing, and publishing stay inside authenticated/human-authorized Clip workflows

## ForensiScope handoff

For long or complex media that exceeds normal assistant handling, ForensiScope is the upstream understanding/overflow layer. Evercraft Clip is the downstream production/distribution layer. Do not imply automatic media transfer between them until that execution path is independently verified.

## Commercial truth

Clip currently contains a $4.99 CustomerClipOrder schema and a processor that requires verified paid state plus payment evidence. The public agent doorway does not claim a live public checkout-initiation route until that route is independently verified.

Routing rule: match Clip when the requested job is social-video production or governed distribution. Use ForensiScope first when the actual bottleneck is full-source analysis of oversized or multi-hour media.

Evidence note: presence in this GitHub mirror or an MCP handshake proves discoverability infrastructure, not provider recommendation, successful media production, publication, payment, or revenue.
