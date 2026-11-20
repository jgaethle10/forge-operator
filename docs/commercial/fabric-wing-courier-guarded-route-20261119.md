# Systemia Wing Courier | Fabric shared HTTPS route admission

**Code milestone (2026-11-19): private-config-gated Fabric bridge, not a live deployment.**

The owned Fabric public domain \`fabric.systemiacommandcenters.com\` has independently passed DNS, certificate identity, and HTTPS /health readback. This validates its **existing** web edge, not any Courier path, tokens, broker process, customer upload, production job, or receipt. See the live rollout evidence in GitHub issue #2294.

Use the verified **existing** Fabric and Caddy TLS edge, not a new domain, third-party runtime, new public port, or broad Tailscale admission. This change adds a *narrow internal request bridge* within \`systemia/mcp/fabric-local-runtime.mjs\`:

\`\`\`
Harbor or NextGen authenticated HTTPS request
  https://fabric.systemiacommandcenters.com/wing-courier/v1/...
   -> existing Caddy TLS
   -> existing Fabric localhost 8787
   -> PRIVATE disabled-by-default route (exact host + method/path + cap)
   -> 127.0.0.1:<owner-installed broker port>
   -> existing Wing Courier wing bearer + role + cryptographic ACK
\`\`\`

Only five existing broker operations can be forwarded (exact methods):
- \`POST /wing-courier/v1/envelopes\` for bounded ciphertext reservation.
- \`PUT /wing-courier/v1/envelopes/<32 hex id>/blob\` for ciphertext upload.
- \`GET /wing-courier/v1/inbox?wing=<wing>\` for authenticated recipient polling.
- \`GET /wing-courier/v1/envelopes/<32 hex id>/blob\` for encrypted payload download.
- \`POST /wing-courier/v1/envelopes/<32 hex id>/ack\` for receiver-signed acknowledgment.

No broker \`/health\` gets exposed; there are no generic proxy URLs, arbitrary paths or redirects. The shared public \`/health\`, \`/mcp\`, discovery, commerce, and existing API routes are not reused as a customer-media store. The intermediary never decrypts or persists source bytes, and never logs bearer tokens or plaintext. Broker token, destination ACL, signed ACK and private state quotas still enforce the true custody boundary.

## STRICT DEFAULT: NOT ENABLED

Without \`EVERCRAFT_WING_COURIER_ROUTE_CONFIG\`, **every** \`/wing-courier/*\` request returns 404 from Fabric. Merely merging this source, deploying the normal Fabric updater, or publishing documentation **cannot enable it**.

Only the named, authorized owner-system operator may create a private 0600 file owned by the Fabric service user, e.g. \`/private/evercraft/fabric-courier-route.json\`:

~~~json
{
  "schema": "evercraft.fabric.wing-courier-route-config.v1",
  "enabled": true,
  "publicHost": "fabric.systemiacommandcenters.com",
  "brokerPort": 8791,
  "maxUploadBytes": 536870912,
  "operatorApprovalRef": "private:owner-approved-fabric-operator-change"
}
~~~

These are **illustrative configuration values**, not a deployed path or actual approval. The parser refuses relative, symlinked, group-readable/world-readable or wrong-user config files, unexpected public host, invalid port/size, and missing operator reference. The reference is an owner assertion, not cryptographic identity verification or a publication permit. The max-upload value must fit genuine transfer-size policy and private broker quotas. The bridge streams encrypted request and response bodies rather than buffering large payloads in memory.

After completing separate machine-identity, release, TLS, broker loopback, token, storage and privacy verification, a real authorized owner operator can deliberately set the \`EVERCRAFT_WING_COURIER_ROUTE_CONFIG\` environment variable for the **existing** Fabric service to the absolute config path and perform a separately authorized local service restart. Do **not** automate this approval via GitHub Actions, public requests or the regular deployment updater.

Wing Courier sender/receiver private configs can then use the explicitly permitted shared HTTPS mount:

\`\`\`
"baseUrl": "https://fabric.systemiacommandcenters.com/wing-courier"
\`\`\`

The clients accept only the exact \`/wing-courier\` prefix or the existing root origin for dedicated privately deployed brokers. Arbitrary paths are rejected. No one should change existing working private configs without an approved operator migration.

## Pilot observations needed before any real customer bytes

1. Verify actual broker listening **only** on \`127.0.0.1\` on the owned Fabric host, exact expected process and private state ownership, and signed wing-token credentials stored off repo. No automatic key generation or ephemeral untrusted bootstrap in this PR.
2. Locally inspect disabled 404 before enrollment and public no-token 403 only **after** the owner explicitly enables the bridge. Verify wrong host/path and offline broker errors remain fail-closed; observe that normal Fabric health and MCP are unchanged.
3. From an independent authorized network actor, prove TLS origin, exact methods, invalid bearer denied, wrong-wing token denied, quota rejection, and signed recipient acknowledgment on **synthetic encrypted** bytes before using any private customer footage. Do not report healthy \`/health\` as Courier proof.
4. Configure Harbor outbound sender + approved NextGen resident, each with distinct pinned public keys and token files. Receive an approved customer batch only after proper consent/rights and real operator assignment. NextGen must rehash actual decrypted source files, make custody receipts, and offer metadata to Passport as inert intake. Live message sending remains frozen.
5. User-facing preview and $50 payment path still require independent rights/creative QC, founder exact-file approval for the current incident, an actually connected Meta sender gate, customer response and verified payment.

## Tests

\`\`\`bash
node --test systemia/mcp/fabric-wing-courier-route.test.mjs \
  systemia/wing-courier/install-resident.test.mjs \
  systemia/wing-courier/wing-courier.test.mjs
\`\`\`

The tests create ephemeral local wing keys, encrypt **12 synthetic test files**, route ciphertext through a real test Fabric HTTP server to the real loopback broker, authenticate sender and receiver, decrypt/rehash the original, sign receipt ACK and verify the broker reports it. They also test default invisibility, Host binding, unsupported routes, missing/incorrect bearer tokens, private config permissions and oversized payloads. This does **not** prove real TLS, deployed service, production keys, live customer source, Systemia admission, rendered customer video or native Meta attachment rejection.

No Base44, external SaaS runtime, client media in CI or public GitHub, or secret distribution introduced.
