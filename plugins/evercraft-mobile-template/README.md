# Evercraft Mobile Preview package template

This package exists only for private cross-surface testing. It does **not** replace or modify the Evercraft v1.0.0 plugin currently in OpenAI review.

## Why it exists

A manually uploaded plugin that declares MCP servers through `mcp.json` or `.mcp.json` can be labeled Desktop only even when the MCP server is remote HTTPS. The mobile preview instead references a ChatGPT-registered MCP app through `.app.json`.

## Required registration

1. In ChatGPT, enable Developer mode.
2. Go to Plugins and select the plus button.
3. Register `https://fabric.systemiacommandcenters.com/mcp` as the MCP server.
4. Copy the technical ID from the resulting browser URL. It must start with `plugin_asdk_app_`.
5. Build the package with:
   `node scripts/build-evercraft-mobile-plugin.mjs --app-id plugin_asdk_app_...`

The generated package contains `.app.json` and intentionally contains **no** `mcp.json` or `.mcp.json`.

The public directory submission remains a separate With MCP review flow and must not use this app-reference package.
