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
- `home.identity.sessions.manage` — end all Evercraft Home sessions for the authenticated subject.

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

Raven currently has strong registry, discovery and probe surfaces in Forge, but this Home slice does not pretend that those are equivalent to a standalone Raven human runtime. Yard and Network have substantial executable owned components; Home will expose those only as their bounded operator APIs are attached and verified.

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
6. verifies the Home path never grants execution authority.

## Next production slices

1. Production owner bootstrap on admitted Evercraft capacity with the signing secret/keyring supplied outside source control.
2. Bind the read-only Yard view to the canonical production Yard state directory.
3. Add private Network telemetry only through an authenticated Network operator API, never through public discovery metadata.
4. Raven Nexus owned runtime adapter once runtime readiness is evidenced.
5. Consequential actions through Passport permits + Execution Gate, never directly from the UI.
6. Evercraft-owned deployment route and domain binding.

Base44 remains a migration source for legacy applications only and is not part of Home's boot or authority chain.


## Owner bootstrap

The initial owner identity is created locally through `systemia/identity/bootstrap-owner.mjs`. It requires an explicit manual authority receipt and reads the password from a permission-restricted local file. The password file should be deleted after successful bootstrap.

Bootstrap also creates the initial `evercraft-home` Passport grant for the owner. Identity still does not own authorization after that point.


## Session security

Every production session carries a signing key ID. Home may admit the current signing key plus explicitly configured retiring verification keys during a bounded rotation window. Removing a retiring key immediately causes sessions signed by that key to fail closed.

Normal sign-out revokes the specific server-side session before clearing the browser cookie. The Account Security control uses `home.identity.sessions.manage` to end all prior Home sessions for the authenticated subject. Fresh authentication after the cutoff creates a new valid session.
