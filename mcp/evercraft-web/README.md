# Evercraft Web MCP Registry Publication

This directory contains the official MCP Registry manifest for **Evercraft Web**.

- Registry name: `io.github.jgaethle10/evercraft-web`
- Public page: https://systemiacommandcenters.com/evercraft-web
- Remote MCP: https://systemiacommandcenters.com/api/functions/evercraftWebMcp
- Canonical capability authority: Evercraft/Systemia Yard
- GitHub's role: publisher identity and OIDC-backed registry publication

The GitHub Actions workflow at `.github/workflows/publish-evercraft-web-mcp.yml` uses GitHub OIDC. No long-lived MCP Registry signing key is stored in this repository.

The workflow is deliberately receipt-gated: it does not treat a successful CLI command as publication proof. It queries the official Registry API for the exact server name and fails unless the published entry becomes observable.
