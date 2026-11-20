# One-Body durable mission checkpoint | Courier → Systemia Goal Runtime

**Stage:** source integration and tests, optional owner-private runtime opt-in. **No workers or customer media executed.**

Why: the previously merged `oneCompanyPlan` was only a read-only projection. A verified receiver can restart after a successful intake, and a downstream operator needs a **durable, idempotent, privacy-safe mission plan** with named specialist dependencies and real authorization holds.

## Contract

`systemia/one-company/goal-checkpoint.mjs` uses Evercraft's **existing** `systemia/organism/goal-runtime.mjs` to create an `evercraft.goal.state.v1` from an authorized Wing Courier `harbor → fallen` media custody receipt already offered successfully to Passport-gated Intake Fabric. It binds the goal to opaque package ID, actual Intake candidate, `sha256:<hex>` receipt hash and the existing immutable one-body coordination plan.

The new goal has tasks for **rights/order validation → Saban/Yard capacity preflight → optional ForensiScope local review → Fallen producer → independent QC → Harbor private preview → customer approval readback → Evercraft Payments provider readback → Shipping**. Each stage depends on the previous stage, has an **unresolved signed human gate**, has `attempt:0`, and cannot start from a GitHub issue, JSON proposal, or user-supplied status string. ForensiScope is omitted when the verified original inventory has no audio/video. Even when it is present, it does **not** get media paths, compute, inference, auto transfer or rights approval.

## Owner-private optional activation

A real owner controls the existing **Fallen**, Node >=22, Wing Courier user runtime. The optional resident config field is `goalStateDir`. It can only be used when `wing:'fallen'`, `intakeStateDir` and `passportStateDir` are actually configured and validated. The goal directory **must already exist**, be 0700, owned by the service user and not a symlink. It is not created by GitHub or by the installer.

The existing `install-resident.mjs --wing fallen --config <PRIVATE_CONFIG>` remains a **dry-run**. The owner must separately approve any real service activation. This PR does **not** authorize a service restart or change the currently deployed configuration.

When a genuinely authenticated, hash-revalidated private media receipt passes Passport-gated Intake and this optional directory exists, the receiver creates `<opaque-package-id>.goal.json` with exclusive-create 0600 storage and fsync. The private `intake-offer.json` contains `goalCheckpoint` with the source binding and `workStartedByThisCall:false`. Repeated attempts keep the original bytes and never overwrite an existing goal or erase a previously progressed work ledger. A mismatch, symlink, unsafe mode or changed source binding results in HOLD.

The file is a real `evercraft.goal.state.v1` that **future authorized Systemia Goal Runtime operations** can inspect and update through their existing signed human-approval and durable attempt ledger. A mission file on disk **is not** a Systemia execution authorization, Saban lease, ForensiScope analysis, customer preview approval, payment, provider send or customer asset transfer.

No customer name, source filenames, source hashes, private file paths, tokens or raw footage are embedded in the goal. Opaque package/reference IDs and a SHA-256 binding are persisted owner-locally. No goal content is published to HUDSON or KAIDANCE: those dashboards require a separate redacted, source-receipted adapter and real live deployment.

## Tests and deployment truth

```bash
node --test systemia/wing-courier/*.test.mjs systemia/one-company/*.test.mjs
```

The existing dedicated Wing Courier CI also runs this test set on any `systemia/one-company/**` or Courier change. The host operator must separately validate actual source commit, private directory and live resident proof. Until real authenticated two-way synthetic packages are observed on Harbor and NextGen, the commercial recovery remains **NOT TRANSFERRED**, and the rejected preview remains frozen (#2284).

Tracking: #2294 live Courier, #2414 Harbor local readiness, #2416 one-body coordination, #2280 first commercial. Not a replacement for any existing specialist-specific authority gate.
