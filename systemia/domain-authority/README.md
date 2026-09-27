# Evercraft Domain Authority + Evermail

This lane closes the gap between the already-proven Evercraft public-edge runtime and a real Evercraft-owned public domain/email surface.

## Current truth

The public-edge software path is proven, including wildcard HTTPS routing, TLS certificate admission, receipt-bound route leasing, private Yard authority, resident supervision, field-attestation gates and external-canary contracts.

Production remains held on two real-world proofs:

1. Node 001 must complete the physical field-certification mission in issue #175.
2. A real public domain must be delegated to the Evercraft authoritative nameservers and pass trusted public DNS/TLS verification.

Nothing in this module treats CI, a local wildcard certificate or a generated zone as evidence that public DNS or public email is live.

## Architecture

Evercraft owns the control plane:

- zone and mailbox intent,
- nameserver placement,
- deployment admission,
- identity and field receipts,
- certificate policy,
- DNS/mail configuration generation,
- public canaries,
- rollback,
- audit history.

Wire-level DNS and mail daemons should remain replaceable adapters behind that control plane. Do not invent a custom unaudited SMTP implementation simply to claim stack ownership. The Evercraft value is that Systemia/Yard owns the authority, automation, policy, receipts and lifecycle.

No third-party cloud host is required by this contract. The target runtime is Evercraft Compute / NodeSeed capacity.

## Domain promotion gates

A domain is not ready for delegation until:

- there are at least two authoritative nameserver hostnames,
- the nameservers have at least two distinct public addresses,
- in-bailiwick nameservers have glue addresses,
- the zone has an MX route,
- SPF exists,
- DKIM public key exists,
- DMARC exists,
- SMTP TLS reporting exists,
- MTA-STS DNS signaling exists.

After registrar delegation, `public-domain-canary.mjs` must observe the public SOA/NS records, the public edge address and a normally trusted TLS certificate.

## Evermail promotion gates

Evermail is not live until `evermail-canary.mjs` proves:

- MX is publicly resolvable,
- the intended mail host is the MX destination,
- the mail host has public address records,
- SPF is published,
- DKIM is published,
- DMARC is published,
- TLS reporting is published,
- MTA-STS signaling is published,
- reverse DNS points back to the mail hostname,
- public port 25 answers SMTP,
- STARTTLS is advertised,
- the SMTP certificate validates normally.

Mailbox UI, IMAP/JMAP access, spam filtering, outbound submission/authentication and backup/restore are separate runtime concerns and must receive their own receipts before customer or staff use.

## Commands

Render a candidate zone:

```bash
node systemia/domain-authority/domain-plan.mjs \
  --domain=example.com \
  --ipv4=203.0.113.10 \
  --nameservers=ns1.example.com\|203.0.113.53,ns2.example.com\|198.51.100.53 \
  --dkim-selector=evercraft1 \
  --dkim-public-key='BASE64_PUBLIC_KEY' \
  --zone=true
```

Verify public delegation and trusted HTTPS:

```bash
node systemia/domain-authority/public-domain-canary.mjs \
  --domain=example.com \
  --edge-host=edge.example.com \
  --nameservers=ns1.example.com,ns2.example.com
```

Verify Evermail public readiness:

```bash
node systemia/domain-authority/evermail-canary.mjs \
  --domain=example.com \
  --selector=evercraft1 \
  --mail-host=mail.example.com \
  --outbound-ip=203.0.113.10
```

## First Evercraft mailbox

Do not create or announce a staff mailbox until the Evermail public canary is green. When it is green, mailbox creation becomes an identity operation, not another DNS project. Role accounts `postmaster@`, `abuse@`, `dmarc@` and `tlsrpt@` should exist before ordinary staff mailboxes are promoted.

## Safety boundary

Never commit:

- DKIM private keys,
- TLS private keys,
- mailbox passwords,
- allocator tokens,
- raw machine identifiers,
- private topology,
- recovery secrets.

Only public keys, public DNS records, redacted receipts and non-secret canary results belong in Git.
