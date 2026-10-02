# Evercraft app-backed plugin template

This package is a **web/workspace app-reference template**, not the canonical mobile fix.

## Important plan/surface boundary

OpenAI's current custom MCP app / Developer Mode path is not the right private iPhone path for a Plus account. Custom MCP apps are currently web-only, and the Developer Mode controls are plan/workspace gated.

This template remains useful for supported workspaces that already have a real `plugin_asdk_app_...` app ID, but it must not be presented as the solution to Evercraft mobile access.

## Canonical private phone path

Use the ChatGPT Sites bridge described in:

`plugins/evercraft-sites-bridge/SITE-BUILD.md`

ChatGPT Sites is the preferred private cross-surface experiment because OpenAI currently makes Sites available on Plus and allows a Site to host MCP tools and create an associated plugin.

## Desktop-only guard

Any generated app-reference package must contain `.app.json` and must not contain `mcp.json` or `.mcp.json`.

The public Evercraft directory submission remains a separate review flow and must not be changed by this private testing path.
