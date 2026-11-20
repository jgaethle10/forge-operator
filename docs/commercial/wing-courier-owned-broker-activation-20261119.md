# Systemia Wing Courier | owned broker activation gate

**November 19, 2026. Source-only installation helper, NOT a live broker deployment.**

Engineering objective: enable the owner-controlled Penguin wing operator to activate the already implemented encrypted, ciphertext-only Courier broker on \`127.0.0.1:8791\` without using public media upload, manually moving client photos, opening NextGen to the internet, admitting Harbor's vendor machine to a broad tailnet, or granting customer send/payment permissions.

## Safety model

- \`systemia/wing-courier/install-broker.mjs\` is **dry run unless both** \`--activate\` and \`--confirm-owned-host\` are supplied by an approved operator on the actual authorized owner machine. A chat instruction or GitHub merge never runs this activation.
- Preflight requires Node 22+, non-root user, private and same-user-owned 0600 broker JSON and four distinct >=43-character token files, two distinct valid Ed25519 receiver acknowledgment *public* keys, existing owner-controlled 0700 state folder, exact port 8791, exact two wings (\`harbor\` and \`fallen\`) and no other destinations, no symlinked path components. It does **not** generate or print keys, read customer media, or enable the Fabric route.
- Activated service is a normal user systemd unit, with \`NoNewPrivileges\`, \`PrivateTmp\`, and restrictive \`UMask=0077\`. A pre-existing unit is a **HOLD** requiring separate change review, not silently overwritten.
- After activation, a local readback asks \`127.0.0.1:8791/health\` for the ciphertext-only service contract and submits **no bearer token** to assert both send and receive endpoints return HTTP 403. This is a fail-closed protocol canary, not cryptographic process identity attestation or external TLS verification.
- \`EVERCRAFT_WING_COURIER_ROUTE_ENABLED\` stays **unset/off**. Enabling it later is a **separate, owned Fabric-runtime change** requiring peer-key verification, the live broker readiness and owner security approval. Never activate the route merely because this local canary passes.
- No external media transfer, customer file custody, Systemia Passport admission, Fallen creative acceptance, invoice, delivery or Meta Messenger media send is authorized here.

## Existing private broker configuration

Start with the exact broker JSON contract already documented in \`systemia/wing-courier/README.md\`, not an invented new secret-management scheme:

\`\`\`json
{
  "stateDir": "/private/evercraft/wing-courier",
  "port": 8791,
  "wings": [
    {
      "wing": "harbor",
      "sendTokenFile": "/private/secrets/harbor.send",
      "receiveTokenFile": "/private/secrets/harbor.receive",
      "ackVerifyPublicKeyFile": "/private/trusted/harbor.sign.pub",
      "allowedDestinations": ["fallen"]
    },
    {
      "wing": "fallen",
      "sendTokenFile": "/private/secrets/fallen.send",
      "receiveTokenFile": "/private/secrets/fallen.receive",
      "ackVerifyPublicKeyFile": "/private/trusted/fallen.sign.pub",
      "allowedDestinations": ["harbor"]
    }
  ]
}
\`\`\`

All paths above are illustrative. They must be populated from actually approved owner-private data, **not copied literally**. Four send/receive bearer secrets are unique and separately guarded. The two \`.pub\` files are authentic independently enrolled wing signer public keys. Harbor's private signing key stays with Harbor. Fallen's decrypt and acknowledgment signing private keys stay with Fallen. Credentials are **never** present in GitHub, chat, CI or public reports.

## Owner-only dry-run and activation

On the owned server with the real approved private config:

\`\`\`bash
node systemia/wing-courier/install-broker.mjs --config /approved/private/wing-broker.json
\`\`\`

Expected state is \`DRY_RUN\` with \`publicRouteActivatedByThisTool:false\`, \`unitInstalled:false\` and zero customer custody. Do not treat this as a green light to route public network traffic.

Only after confirming actual machine/user, service identity, separate owner approval, key custody, quotas/retention and loopback security may the operator use:

\`\`\`bash
node systemia/wing-courier/install-broker.mjs --config /approved/private/wing-broker.json --activate --confirm-owned-host
\`\`\`

This creates one new user service, refuses to overwrite an existing one, and checks real local service health plus denied unauthorized send/receive. A pass still requires separate owner-verified live TLS route, config provenance, Harbor ↔ Fallen identity enrollment, real receipt binding and strictly scoped external canaries before transferring any actual client bytes.

## Proof in CI

\`\`\`bash
node --test systemia/wing-courier/install-broker.test.mjs
\`\`\`

The tests use randomly generated **synthetic** wing credentials and real localhost broker HTTP with negative access assertions. They also reject dangerous systemd arguments, reused bearer secrets, invalid access routes, duplicate receiver keys, permission leaks and accidental activation in the default mode. Tests never install a service or contact the public Fabric site.

**Current customer state remains \`CUSTOMER_REJECTED_PREVIEW / RECOVERY_REQUIRED\`.** Do not trigger a repeat preview or payment request. The first real acceptance remains twelve original authorized client files, encrypted Harbor → owned broker → NextGen, rehashed by the actual receiver; only after separate Systemia/Fallen assignment and independent human creative/audio review can founder-approved customer-facing preview delivery be considered.

Tracking: #2294 owner runtime, #2280 customer handoff, #2284 incident.
