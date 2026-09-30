# Evercraft Home

Evercraft Home is the first-party human front door into Evercraft.

It is intentionally not a Base44 application, not a ChatGPT wrapper, and not an AI-first interface. It is a small provider-independent shell that can boot on ordinary Evercraft-controlled Linux capacity with Node alone.

## Authority model

Evercraft Home does not become mission authority.

- Evercraft Identity proves who the human is.
- Passport determines scoped authorization.
- Systemia remains mission authority.
- The Yard owns deployment/runtime handoff.
- Evercraft Network owns transport and continuity.
- Raven Nexus and sovereign/external models are intelligence providers behind the front door.
- External AI and legacy app providers are optional.

Direct Mode is the default.

## Current owned Direct Mode

The first bounded Direct Mode slice is live in source:

- `GET /api/systemia/inventory` reads Systemia's source inventory with source-only evidence semantics.
- `POST /api/systemia/plan` prepares a Systemia control-plane mission plan.
- `GET /api/yard/overview` reads sanitized persisted Yard deployment evidence.
- `GET /api/raven/overview` reads Raven registry, provider-matrix and Nexus probe-contract evidence without claiming a private runtime.
- `POST /api/raven/command-plan` lets the authenticated founder route a bounded work request into Systemia from Raven's Command Desk.
- Raven Command Desk planning explicitly returns `execution_authority_granted=false` and `ai_inference_used=false`.
- Planning explicitly returns `execution_authority_granted=false`.
- The browser home includes a restrained "What do you want to do?" field that submits into that planning route.
- No mission execution, external communication, purchase, deployment, trust change, or other consequential action is authorized by the Home planning field.

This is deliberate. Home is an operating entrance, not a way around Systemia.

## Authentication

### Local development

```bash
EVERCRAFT_HOME_AUTH=local node server.mjs
```

Open `http://127.0.0.1:4310`.

Local auth is forcibly restricted to loopback. The service refuses to start if local auth is configured on a non-loopback host.

### Production boundary

Production uses:

```bash
EVERCRAFT_HOME_AUTH=passport
EVERCRAFT_IDENTITY_SECRET=<managed secret>
EVERCRAFT_IDENTITY_STATE_DIR=/var/lib/evercraft/identity
EVERCRAFT_PASSPORT_STATE_DIR=/var/lib/evercraft/passport
EVERCRAFT_HOME_SESSION_TTL_SECONDS=1800
EVERCRAFT_HOME_COOKIE_SECURE=true
```

A production user signs in through Evercraft Identity. Home receives a short-lived Evercraft-signed `evercraft_session` cookie marked HttpOnly and SameSite=Strict. The verified identity is then checked against Passport. A valid identity without an active Passport grant is denied. Password credentials are stored only as salted scrypt material in the private Identity state directory.

Current Home scopes:

- `home.read` — enter the authenticated Home.
- `home.systemia.read` — read the Systemia inventory.
- `home.systemia.plan` — prepare a Systemia mission plan.
- `home.yard.read` — read sanitized persisted Yard deployment state.
- `home.network.read` — read evidence-safe Evercraft Network declarations and verification metadata.

Home does not issue grants to itself.

## Service discovery

Each owned service is declared in `services.json`. Its origin is supplied at runtime by environment variable:

```bash
SYSTEMIA_ORIGIN=http://127.0.0.1:3000
RAVEN_ORIGIN=
YARD_ORIGIN=
NETWORK_ORIGIN=
SOVEREIGN_AI_ORIGIN=
```

Missing configuration reports `not_connected`. It is never promoted to healthy.

Home now exposes Raven's registry, provider matrix and Nexus probe contracts as a first-class executive read surface while explicitly holding the private-runtime state unless a standalone owned Raven human runtime is evidenced. The Raven Command Desk is a separate direct founder-to-Systemia route: it prepares a receipted Systemia plan and shows routing/holds, but does not pretend an AI answered and does not grant execution authority. The Yard surface exposes sanitized persisted deployment state including workload class, runtime fabric and verification metadata, while excluding lease secrets, credentials and private endpoints.

## Verification

From this directory:

```bash
npm run check
```

The dedicated `Evercraft Home sovereignty` workflow also:

1. boots Home without any external providers,
2. verifies Evercraft remains root authority,
3. verifies missing providers are not reported healthy,
4. reads the Systemia inventory through the HTTP boundary,
5. prepares a Systemia mission through the HTTP boundary,
6. verifies the Home path never grants execution authority,
7. verifies Raven registry evidence does not become a private-runtime claim,
8. verifies an unattached Yard is represented as an evidence hold rather than an empty-production claim.

## Next production slices

1. Bind the Yard executive portfolio to the canonical production Yard state directory on the deployed Home instance.
2. Add private Network telemetry only through an authenticated Network operator API, never through public discovery metadata.
3. Build the standalone owned Raven human runtime and authorized Nexus bridge, then migrate Raven's remaining legacy public discovery route.
4. Add consequential Yard/Network/Raven actions only through Passport permits, Systemia admission and Execution Gate.
5. Keep the public Home canary held until real field ingress, owned DNS delegation and trusted TLS produce a verified `EVERCRAFT_HOME_ORIGIN`.

Base44 remains a migration source for legacy applications only and is not part of Home's boot or authority chain.


## Owner bootstrap

The initial owner identity is created locally through `systemia/identity/bootstrap-owner.mjs`. It requires an explicit manual authority receipt and reads the password from a permission-restricted local file. The password file should be deleted after successful bootstrap.

Bootstrap also creates the initial `evercraft-home` Passport grant for the owner. Identity still does not own authorization after that point.

## Provider credential custody

Authenticated owners can open `/credentials.html` to seal upstream provider credentials into the Evercraft-owned provider credential vault.

The first intake is Alpaca live credentials for DayTrade Lens. The browser sends the key pair only to the authenticated Evercraft Home origin. The server encrypts the pair with AES-256-GCM under a locally generated 256-bit vault key stored with mode `0600` inside the private Identity state tree. Credential envelopes are also `0600`; the vault directory is `0700`.

The HTTP API never returns plaintext credentials. Successful intake returns only an opaque credential reference, the final four characters of the key ID, and a keyed fingerprint. Raw provider secrets are not written to Systemia receipts, GitHub, application entities, browser storage, or logs.

Current endpoints:

- `POST /api/credentials/providers/alpaca` — owner-gated sealed intake.
- `GET /api/credentials/providers/alpaca/status` — metadata only; never returns secret material.
- `/credentials.html` — first-party human intake surface.

Until a dedicated `home.credentials.manage` grant is rolled through existing owner Passports, this narrow intake reuses the already owner-sensitive `home.identity.sessions.manage` scope rather than widening access.

## Emergency phone handoff

When the authenticated mobile Evercraft Home route is temporarily unavailable, `/emergency-handoff.html` provides a local-only bridge that lets a user enter an upstream provider credential once without sending plaintext to chat, GitHub, Systemia, analytics, or a third-party credential service.

The page:
- generates a fresh random 256-bit AES key in the browser;
- encrypts the provider credential with AES-256-GCM and authenticated context;
- clears the plaintext input fields after sealing;
- emits an encrypted `RAVEN1.` handoff and a separate `RAVEN-KEY1.` recovery key;
- performs no network request and uses no browser persistence.

Only the encrypted `RAVEN1.` package may be transported through ordinary channels. The recovery key stays with the user.

Once authenticated Raven/Home is reachable, `/emergency-import.html` decrypts the handoff in the browser and submits the recovered credential directly to Raven's normal provider-vault endpoint. The recovery key is never sent to the server.

This is a temporary continuity path, not a replacement for the canonical authenticated mobile credential intake.

