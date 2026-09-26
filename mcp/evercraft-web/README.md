# Evercraft Web MCP Registry Publication

This directory stages the next MCP Registry manifest for **Evercraft Web**. The receipt-backed production record remains authoritative until this candidate is published and observed through a fresh external canary.

- Registry name: `io.github.jgaethle10/evercraft-web`
- Public page: https://base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/evercraftWebGateway?action=docs
- Remote MCP: https://base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/evercraftWebMcp
- Canonical public edge: neutral Evercraft AI Suite gateway/MCP
- Internal execution authority: Evercraft/Systemia Yard
- GitHub's role: publisher identity and OIDC-backed registry publication

The GitHub Actions workflow at `.github/workflows/publish-evercraft-web-mcp.yml` uses GitHub OIDC. No long-lived MCP Registry signing key is stored in this repository.

The workflow is deliberately receipt-gated: it does not treat a successful CLI command as publication proof. It queries the official Registry API for the exact server name and fails unless the published entry becomes observable.
