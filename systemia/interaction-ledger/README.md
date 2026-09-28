# Evercraft Interaction Ledger

Evercraft Interaction Ledger is the privacy-first relationship memory and contact-safety layer for Systemia.

It is intentionally **not** an auto-blast CRM.

Its job is to preserve enough trustworthy relationship state to prevent Evercraft or an authorized agent from behaving like it has amnesia:

- Did we already contact this person?
- Did they reply?
- Did they opt out on this channel?
- Are we about to send the same thing again?
- Have we sent too many unanswered messages?
- Did we promise them something that is still overdue?
- Does the actor even have current Passport authority to contact this subject on this channel?

## Core rule

A relationship record is **not permission to communicate**.

Contact preflight requires a current Evercraft Passport grant such as:

```
product: evercraft-relationship
scope: contact.email
resource: contact:acme
```

The ledger then applies additional relationship-safety constraints. An opt-out, duplicate message, cooldown, excessive unanswered outreach, or overdue commitment can still deny contact even when Passport authority exists.

## Privacy model

The core operates on opaque subject references.

It does not require raw names, email addresses, phone numbers, or message bodies. When text is supplied for duplicate detection, the ledger stores only a SHA-256 fingerprint. Evidence references point to the authorized source system that holds the original record.

## Contact preflight

`preflightContact()` is read-only. It never sends a message.

It returns `allow` or `deny` with receipt-backed reasons including:

- `passport_contact_scope_missing`
- `channel_opted_out`
- `outbound_cooldown_active`
- `unanswered_outbound_limit_reached`
- `duplicate_content_detected`
- `relationship_commitment_overdue`

A downstream email, DM, SMS, phone, or push system must still perform its own execution and provider checks after preflight.

## Commitment memory

Promises are first-class relationship events. A commitment can be opened, fulfilled, or cancelled with evidence. By default an overdue commitment blocks unrelated outbound contact, which pushes the system to keep promises before asking for something else.

## Architecture

```
Identity authority
  -> Passport scoped authority
  -> Interaction Ledger relationship preflight
  -> approved communications tool
  -> send receipt
  -> Interaction Ledger event
```

This is designed to turn the standing "do not spam or double up" rule into infrastructure rather than a reminder humans and agents have to remember manually.


## Exact-message action permits

For consequential outbound communication, the safe path is stronger than preflight alone.

After preflight passes, `prepareContactPermit()` mints a short-lived, single-use Passport action permit bound to:

- the authorized actor
- the exact contact
- the exact channel
- the `contact.<channel>` scope
- the SHA-256 fingerprint of the approved message
- the backing Passport grant
- a short expiry

The permit does not send anything.

After the approved communications provider accepts the exact message, `finalizePermittedContact()` consumes the one-time permit with the provider receipt and records the outbound interaction.

Changing the content changes the fingerprint and invalidates the permit. Reusing the permit fails. An opt-out or other failed preflight never receives a permit at all.

That gives Evercraft a defensible outbound path:

```
Passport grant
  -> relationship preflight
  -> exact-message single-use permit
  -> approved provider action
  -> provider receipt
  -> consume permit
  -> record interaction
```

The design makes duplicate or content-swapped agent sends fail at the authority layer, not merely because someone remembered a CRM rule.
