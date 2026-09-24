# Systemia Release Authority

Systemia release authority is **policy controlled**, not globally disabled and not globally unrestricted.

The release path is:

```
verified source
→ CI
→ release classification
→ ReleaseAuthorization
→ provider release runner
→ ReleaseExecutionReceipt
→ independent production verification
→ ReleaseVerificationReceipt
```

## Authority model

### Routine public changes
Routine changes may release automatically **only after required CI passes**. Examples include ordinary UI, documentation, public discovery metadata, and bounded product logic that does not touch trust surfaces.

### Trust-surface changes
Authentication, authorization, security policy, credentials, payments/billing, release machinery, and similar trust surfaces require explicit human release approval after CI passes.

### Destructive changes
Migrations or changes with destructive signatures require explicit human release approval after CI passes and should preserve a tested rollback path.

## Critical invariant

A builder, agent, or source mutation runner does not possess blanket production authority. Production authority is granted to a specific verified revision through the release policy. The release runner receives only the provider credentials it needs at execution time. Credential material must never be written to release receipts.

## GitHub runtime lane

`.github/workflows/publish-runtime.yml` is the first production adapter. It no longer publishes merely because `main` changed. It waits for **Forge checks** to pass, classifies the verified diff, and auto-publishes only `routine_public` revisions.

Trust-surface or destructive revisions are held. They can be released with the workflow's explicit manual approval path after the same verification suite runs against the exact requested SHA.

This is the standing Systemia model for future provider adapters.
