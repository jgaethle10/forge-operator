# Evercraft Passport

Evercraft Passport is the shared authorization, consent, and delegated-capability fabric for the Evercraft portfolio.

It is not a customer profile database and it deliberately does not require raw email addresses, phone numbers, legal names, or behavioral dossiers. Passport works with opaque subject references supplied by an authoritative identity layer.

Its job is narrower and more powerful:

> Given this verified subject, product, requested action, resource, and time, is the action currently authorized, by whom, through what lineage, and can that authority be safely delegated?

## Core model

```
verified authority
  -> grant
  -> optional bounded delegation
  -> authorize
  -> mint short-lived action permit when consequence requires it
  -> consume permit exactly once
  -> revoke at any ancestor
```

A grant is scoped to:

- one subject reference
- one Evercraft product
- one or more actions/scopes
- optional resource references
- a start and expiration time
- a bounded delegation depth
- an authoritative receipt

## Why it matters

Without Passport, every Evercraft product eventually invents its own roles, agent permissions, consent booleans, API keys, and delegation rules. Those systems drift.

Passport gives RIVET, ForensiScope, Systemia, Evercraft Web, Clip, Network, Opportunity Fabric, future mobile clients, and agent integrations the same permission grammar.

A user can authorize an agent to read one RIVET report without implicitly granting payment authority. A project operator can delegate a narrow site-inspection scope to a worker without delegating every capability they hold. Revoking the parent grant invalidates the entire descendant chain immediately.

## Security invariants

- Client-claimed authority is not accepted as verified authority.
- Delegation can **attenuate** authority but never amplify it.
- Delegated scopes must be a subset of parent scopes.
- Delegated resources must remain inside the parent's resource set.
- Delegated validity cannot extend beyond the parent grant.
- Delegation depth is bounded.
- Revocation of any ancestor invalidates every descendant.
- Authorization checks are read-only and receipt-backed.
- Consequential actions can be narrowed further into single-use action permits.
- Action permits are bound to one grant, actor, product, scope, resource, exact request fingerprint, and a maximum 15-minute lifetime.
- Consuming a permit is durable and replay-safe; a second consumption is rejected.
- Revoking the backing grant invalidates an unconsumed permit immediately.
- Action permits are explicitly not bearer credentials. Possession of a permit ID alone grants nothing.
- Capability envelopes are tamper-evident snapshots, not bearer credentials and not self-authenticating tokens.
- Receiving systems must verify current state with the authoritative Passport service before consequential action.
- Raw personal identifiers are outside this core by design.

## Example

A human operator holds:

```
product: rivet
scope: site.*
resource: site:yakima-001
```

They can delegate:

```
product: rivet
scope: site.inspect
resource: site:yakima-001
```

They cannot delegate:

```
payment.refund
site:seattle-002
```

because neither authority exists in the parent grant.

## Relationship to other Evercraft primitives

- **Identity layer** proves or resolves who the subject is.
- **Passport** decides what that subject is allowed to do.
- **Meter** controls usage capacity and entitlement consumption.
- **Payments** remains authoritative for money movement and payment state.
- **Systemia** orchestrates work while respecting all of those boundaries.

Passport should become the common authorization membrane around reusable Evercraft capabilities instead of each application growing its own incompatible permission island.


## Single-use action permits

Long-lived authorization is useful for ordinary read access, but it is too broad for many consequential agent actions. Passport therefore supports a second layer: a short-lived action permit.

Example:

```
grant:
  product: rivet
  scope: report.generate
  resource: site:yakima-001

permit:
  actor: user:operator
  scope: report.generate
  resource: site:yakima-001
  request_fingerprint: sha256:<exact normalized request>
  expires: <= 15 minutes
  single_use: true
```

The receiving execution service still verifies the current permit state with Passport. It then consumes the permit with an evidence reference when the exact action begins or completes according to that service's execution contract.

Changing the request changes the fingerprint and causes consumption to fail. Replaying a consumed permit fails. Revoking the parent grant before consumption also fails.

This lets Evercraft move from broad session authority toward **transaction-scoped authority**, which is a better fit for autonomous agents operating real systems.
