# Evercraft Domains | Owned namespace, DNS, and hosting control plane

**State: private DNS lab implemented; public domain / .evercraft TLD / customer-site publication NOT LIVE.**

This feature extends existing Evercraft-owned authoritative DNS, Caddy edge, Systemia/Yard hosting authority and client CX-001 contracts. No Base44 runtime, third-party host, DNS account connection or registrar purchase is involved.

## Three separate naming lanes

| Lane | Name | What it means | State |
| --- | --- | --- | --- |
| Public .com | `onthegoquicklube.com` | Ordinary public DNS under client-controlled registration, on an Evercraft origin after verified TLS/delegation | Proposed, not registered by this feature |
| Public subdomain | `client001.<approved-evercraft-owned-domain>` | Public DNS under an existing owner-controlled parent domain | Requires parent zone authority, client consent, HTTPS |
| Private .evercraft | `onthegoquicklube.evercraft` | Custom split-DNS name for devices with an explicitly configured private resolver | Loopback DNS lab only |

**Never claim `.evercraft` is delegated on the public internet.** A public top-level domain requires the appropriate registry application and delegation process, not just Evercraft-owned authoritative servers.

## Current commands (no public mutation)

```bash
node systemia/evercraft-domains/cli.mjs plan
node systemia/evercraft-domains/cli.mjs lab-zone
node --test tests/evercraft-domains-private-namespace.test.mjs
# Optional LOCAL DNS socket proof: UDP+TCP on 127.0.0.1:15353 only
node systemia/evercraft-domains/cli.mjs serve-lab --port 15353
# In another shell if dig is installed:
dig @127.0.0.1 -p 15353 onthegoquicklube.evercraft A
```

The lab returns `127.0.0.1` to prove DNS wire handling ONLY. It does not make Juan's website available at this name, configure his devices, issue trusted certificates, create a domain, or expose a public server. Never configure arbitrary user devices to use the authoritative-only lab endpoint as their whole-system resolver. Production private naming requires an authenticated and approved split-DNS resolver that forwards only `.evercraft` to an isolated authoritative service and leaves all ordinary DNS unchanged.

## New: localhost split-DNS integration (development only)

The test now adds `split-resolver.mjs` and `split-cli.mjs`, retaining the
existing Evercraft authoritative `.evercraft.` DNS answer engine.

- Exact `.evercraft.` questions stay private and authoritative, including
  negative answers. There is **no fallback** to ordinary public DNS for
  unknown private names.
- Ordinary DNS questions are sent **only** to an explicitly configured
  loopback DNS upstream. With no upstream, ordinary names return SERVFAIL.
  The lab never invents a public resolver or contacts external DNS services.
- All listeners bind `127.0.0.1` on unprivileged ports. Only one standard,
  uncompressed, IN-class DNS question is supported per request in this
  bounded lab. TCP and UDP both have real packet acceptance tests.
- This is **not** a transparent network-wide resolver, authenticated remote
  resolver, DNSSEC validator, production DNS forwarder, or a device
  configuration installer. Do not set it as a phone/router's default DNS.

Run standalone, keeping normal OS DNS unchanged:

```bash
node systemia/evercraft-domains/split-cli.mjs --port 15453
# Above, all non-.evercraft names receive SERVFAIL.
# In an isolated lab only, an explicitly approved local DNS upstream may be
# passed, e.g. --upstream 127.0.0.1:15553
node --test tests/evercraft-domains-split-resolver.test.mjs
```

The test suite creates a synthetic loopback public upstream so ordinary
queries can be forwarded and compared without contacting the internet.
`onthegoquicklube.evercraft` still returns the synthetic
`127.0.0.1`, not Juan's production website.

### Important HTTPS limitation

DNS answers alone do not make a custom `.evercraft` HTTPS site trusted.
Before any real client rollout we must distribute a consented device
configuration and prove an authenticated private resolver, an isolated
authorized Caddy site, and a proper device trust model. There is no public
CA / ICANN delegation claim and no browser-security bypass.

## Client 001: exact private hostname to local website bytes (operator lab)

The Client 001 bridge is **not** a public rollout. It demonstrates that
Evercraft's exact private DNS name can be connected to our real, canonical
On The Go V4.1 HTML instead of a placeholder page:

```bash
node systemia/evercraft-domains/client001-preview-bridge.mjs --port 18081
# Another shell on the same machine:
curl -i -H 'Host: onthegoquicklube.evercraft' http://127.0.0.1:18081/
curl -i -H 'Host: onthegoquicklube.evercraft' http://127.0.0.1:18081/healthz
node --test tests/evercraft-domains-client001-local-preview.test.mjs
```

This process binds **only** to `127.0.0.1`, serves read-only canonical
HTML, and refuses lookalike hosts, POST requests, other clients and
unrelated paths. No mail or bookings are captured. Existing site images,
styles and client-side scripts remain embedded in the canonical HTML.
Source equality is checked byte-for-byte in CI.

The resolver's synthetic private A answer maps this name to
`127.0.0.1`. The HTTP bridge is on port 18081, not 80 or 443. This is
usable only on the same host during deliberate testing. It is **not**
accessible from another machine, a regular customer phone, or public
internet; there is **no TLS certificate** or authorized customer promotion.

Actual device onboarding requires owner permission, stable private
service addressing, authenticated DNS delivery, trusted HTTPS, reliability
review and final customer-facing release. Do not configure personal
devices' system DNS or a router with these lab endpoints.

## Scoped HTTPS proof (ephemeral local CI only)

The Caddy TLS lab in `Client001.Caddyfile.tls-lab` proves a **real TLS
handshake and exact certificate hostname**, rather than claiming that DNS
alone makes the website browser-ready.

- Uses the actual canonical `public/clients/on-the-go/review/index.html`;
  no copy, redirect to GitHub Pages, external web host, or live client edit.
- The test creates a short-lived CA and a leaf certificate with an exact
  SAN for `onthegoquicklube.evercraft` **inside an isolated runner**.
  No root or private key is committed, uploaded, or installed into an
  operating system or browser trust store.
- Starts only an unprivileged `127.0.0.1:18443` Caddy test listener. A
  separate local split-DNS listener returns the private alias to loopback.
- A Node.js HTTPS client explicitly trusts the temporary CA *for that
  request only*, checks the real certificate hostname, site bytes,
  noindex/robots, method restrictions, and negative tests proving the
  site cannot be loaded without that scoped trust.
- The CI evidence artifact contains only a JSON receipt: hostname, TLS
  verified status, body digest, and negative-test status. No private keys.

This is not a trusted Chrome/Safari/Firefox client-device session. Actual
phone and laptop access requires Juan's permission, authenticated private
routing and a consented, OS-supported TLS trust installation or other
authorized naming strategy. `tls internal`, certificate error bypasses
and silent root authority installation are **not** acceptable substitutes.

CI workflow: `.github/workflows/evercraft-domains-client001-scoped-https.yml`.
Local reproduction on a disposable machine with Caddy Docker, Node 22,
OpenSSL and curl can use the workflow steps. Never run them against a
production Node, router, customer device or public edge.

## Controls

- `registry.json` lists a **held candidate identity**. A source commit cannot approve the client's brand, legal ownership, domain charges, DNS edit, customer publication or redirect.
- Public domain authority stays with registrar/registrant and existing Evercraft DNS delegation/canary contracts. Do not mark a .com live from RDAP 404 or green unit tests.
- All binding states start held. Any non-loopback private host mapping later must be admitted through Systemia/Passport, private network authorization, scoped identities and DNS/TLS verification.
- For browsers, private HTTPS trust is an independent gate. Don't issue deceptive certificates, suppress security warnings, or imply a public CA will issue a certificate for `.evercraft`.
- Multi-client namespace reservation requires unique names, customer authorization, no impersonation or conflicts, and a clear ownership/handoff and expiration policy.
- Not an open recursive resolver. No bind to `0.0.0.0` from this lab. No router, Caddy, IONOS, upstream public DNS or live tenant site mutations.

## Next controlled promotion

1. Verify Juan's choice of alias/public name, registrar ownership and exact approval for the site.
2. Establish private DNS forwarding and an authenticated access model on an Evercraft-controlled private network, with separate, verifiable TLS/HTTP path.
3. Build an owned DNS nameserver pair on **independent** failure domains, externally witness real public A/NS/SOA/TCP/UDP/TLS before delegating any owned public domain.
4. Bind approved client hostnames to the existing immutable versioned Caddy release and external CX-001 browser regression.
5. Keep GitHub as canonical source; Systemia authorizes and records releases; never silently use GitHub Pages as the customer-facing runtime.
