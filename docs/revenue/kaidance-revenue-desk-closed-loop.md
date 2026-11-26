# Kaidance × Systemia Revenue Desk: an honest five-minute commercial loop

**Status: source integration in review. No private owned-node deployment, fresh Gmail synchronization, autonomous reply, sale, or purchased service is claimed.** This extends the *existing* `kaidance-company-heartbeat` only. No new scheduler, CRM, marketing agent, buyer contact, data source, publication or payment connector.

## Why this matters

Evercraft already has two real parts of a revenue system:
- The [global public opportunity scout](./kaidance-global-opportunity-scout.md) runs as a source-bound read-only adapter on the existing company heartbeat. Its single official World Bank source refreshes roughly every six hours, **not** by contacting every buyer every five minutes. Other global procurement sources remain future work / separately qualified.
- The existing [private Systemia Revenue Desk](../../systemia/revenue-desk/README.md) reconciles genuine Gmail Sent/Inbox metadata with the Interaction Ledger and Passport. It can distinguish a submitted RFP, a sent email, a human reply, customer hold, bounce and unresolved prior correspondence, but is a source-side tool **not yet proven continuously bound** to the owned resident Gmail feed.

Until now those two halves lacked a small read-only **revenue-reply triage** connection in Kaidance's company queue. A five-minute pulse should notice evidence, not manufacture buyers.

## Added source bridge

`systemia/organism/kaidance-revenue-desk-bridge.mjs` reads only a **separately generated, fresh, private** `evercraft.systemia.gmail-reconciliation.v1` report from the *existing* Revenue Desk. This is not a Gmail reader, SMTP sender, refund tool or data miner.

An owned operator can opt in by setting:

```sh
SYSTEMIA_REVENUE_DESK_RECONCILIATION_FILE=/owned/private/systemia-revenue-desk/reconciled-gmail-report.json
```

Alternatively the existing runner accepts `--revenue-desk-receipt /owned/private/.../reconciled-gmail-report.json`. The file must exist under a private 0700 directory, be a regular 0600 file (no symlink), be at most 1 MiB and be generated at most two hours before the cycle. The owner's existing private reconciler must produce and refresh it independently from authorized Gmail history plus private authorized prospect records. **No new scheduled importer or privileged publisher is created.** Do not put the actual report in a public GitHub checkout, CI artifact or Kaidance observatory.

If no report is configured the company heartbeat emits `revenue_desk_continuity.status=not_connected`; stale/unsafe/tampered/incomplete reports hold all inbound review candidates. This never downgrades other company heartbeat lanes. A receipt must be advisory-only, private-body-free, carry no provider delivery / buyer acceptance / payment truth claim and explicitly forbid unattended sends.

When private source history is valid and complete, the adapter creates at most **three opaque HMAC work keys** for **non-auto inbound messages later than the latest outbound**. A thread with a later founder reply is not treated as unanswered. Bounce, opt-out, do-not-contact, deferred/customer hold or unresolved delivery delay are excluded from all contact-review proposals, even if the original metadata looks like a reply. It does **not** inspect the email content or determine qualification, price, scope, procurement eligibility, customer consent or whether the buyer accepted.

The same `kaidance-company-heartbeat` `queue.json` and `kaidance-next-action` source reconciler may nominate an operator to **review the existing private Revenue Desk**. The reviewer must still reconcile the precise thread against owner human actions, quotes, prior holds and the qualified contract before any separately approved message. Only the canonical Passport/Interaction Ledger/provider pipeline can authorize external contact.

## Strict commercial semantics and active examples

- Climate Breakthrough: the `$27,500` proposal was **submitted Nov 20 and acknowledged by the recipient**. Status remains **awaiting evaluation** with an anticipated decision Dec 18. It is not a new unhandled buyer reply, contract or paid revenue. Never re-submit.
- Viva la Zone: buyer's acknowledgment of the previously submitted `$195` migration preflight offer means **under review**, not acceptance or an active work order. The existing email thread already has an outbound proposal; no automated follow-up.
- MUB public website RFP: an official solicitation package is not prime-bid eligibility. Its in-house staffing and past-project requirements must be qualified before proposing work. A separate eligibility inquiry was already sent.
- Other hold: Circle H RV Park was deferred to spring 2027. Neither global discovery nor any heartbeat signal overrides this existing suppression.
- Interested/replied is not awarded. Gmail `SENT` is not delivered. Checkout created is not settled. A CI pass and a queued action are not worker execution or customer delivery. No side-effect counter increments from this source bridge.

## Release gates

1. **Source / CI:** run `node --test tests/kaidance-revenue-desk-bridge.test.mjs tests/kaidance-company-heartbeat.test.mjs tests/kaidance-next-action.test.mjs`. The original frontier workflow includes this new test in its existing heartbeat safety step, without creating any cron.
2. **Owner-private source:** prove a separately authorized, complete, signed/fresh relevant Gmail history and private Revenue Desk report (real data stays private) plus conservative bounce/deferred/follow-up suppression. This PR does not create signed coverage authority or read Gmail itself.
3. **Owned resident:** review/merge, deploy an exact SHA to authorized Penguin/NextGen Systemia Core, point only the private service to the private report, verify at least two *increasing* 300-second resident cycles with receipt hashes and no customer/PII projection or duplicated queue action.
4. **Decision and outcome:** verify reviewed replies, approved one-to-one communications via Passport, buyer acceptance and actual payment/fulfillment from their own providers. Only those receipts advance pipeline/revenue state. The existing hourly Revenue & Deadline Radar remains the broad scout, not a five-minute sender.
5. **Next bounded extension:** evaluate a similarly private, authoritative RFP **deadline/decision index** from the existing Revenue Desk. There is no such normalized feed wired in this PR; don't invent one or claim Kaidance is already checking every live tender deadline every tick.

**Canonical source / continuity:** GitHub [#2251](https://github.com/jgaethle10/forge-operator/issues/2251) for revenue/dedupe and [#1426](https://github.com/jgaethle10/forge-operator/issues/1426) for five-minute liveness. Existing review-only global procurement scout stays authoritative for that public source. Protect internal source evidence and all personal data.
