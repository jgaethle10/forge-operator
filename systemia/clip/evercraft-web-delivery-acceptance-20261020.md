# Evercraft Web: customer-deliverability gate | 2026-10-20

**Status: HOLD (no proven generally available product).** This is separate from marketing asset completion.

### Confirmed evidence
- Official `mcp/evercraft-web/server.json` on main references legacy Base44 URLs. Glama issue #456 records HTTP 402 during external test.
- Owned Fetch replacement PR #1385: source + Oct 18 temporary GitHub-runner real HTTPS Fetch, protocol, safety and private-address tests. **Not a persistent deployed customer endpoint.**
- Browser Worker PR #1168: standalone Playwright/Chromium source and successful Oct 15 Docker CI. Production independent Browser execution remains **held**.
- Launch PR #1495: landing page and commercial drafts, not deployed retail availability.
- Connected Evercraft plugin query returned a connection failure on Oct 20; independent run from model's container could not resolve external DNS. Neither is proof that the owned customer's service is permanently down.

### Exactly what unblocks the sale
1. Security review and controlled production release of owned Fetch candidate on an owned/approved Yard or Compute host with separate external HTTPS front door, secrets, restart, logs and rollback.
2. Run `scripts/evercraft-web-cold-client-canary.mjs` against the **actual externally deployed customer endpoint**:
   ```sh
   EVERCRAFT_WEB_PUBLIC_MCP_URL='https://<OWNED-HOST>/mcp' EVERCRAFT_WEB_TEST_TOKEN='<TOKEN_IF_REQUIRED>' node scripts/evercraft-web-cold-client-canary.mjs
   ```
   The evidence file must show `production_fetch_accepted: true` and all checks pass. The test is read-only and intentionally rejects private targets.
3. After independent proof, update both published Evercraft Web registry manifests to the actual verified owned URL, republish and retest with an external cold client + Glama. Do not blindly redirect to the unrelated universal discovery surface.
4. Replace temporary public GitHub issue lead CTA with private customer intake and verify a CRM receipt.
5. Approve narrow paid Fetch pilot scope, support terms, invoice/checkout and entitlement; verify actual fulfillment before counting revenue.
6. Hold Search and Browser production claims until their separate canaries succeed. No hidden TinyFish/Base44 fallback.
7. Use Evercraft Clip for human-approved publication; never advertise active signup/instant browser fulfillment on this draft.

### Creative truth
Evercraft Web commercial RC01 is a 27-second first-party animation with original sampled-piano-and-strings score, illustrative URL/text/receipt graphics, and an explicit production-release hold. It is **not** a live production browser recording.
