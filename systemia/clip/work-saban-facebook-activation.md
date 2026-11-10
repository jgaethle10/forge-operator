# Work Saban company Facebook rotation | activation contract

Campaign: `work-saban-clip-evergreen-20261030`  
Owner directive: October 30, 2026, continuing November 4, 2026  
Canonical publisher: `systemia/clip/work-saban-facebook-resident-runner.mjs`  
Supervisor: `work-saban-clip-facebook-company-publisher` (hourly, first-party owned runtime)

## What is already authorized

The founder authorized organic rotation of Work Saban through Evercraft Clip to Evercraft-owned corporate channels. The reviewed source-of-approval record is `systemia/clip/authority/work-saban-corporate-rotation.json`. It is scoped to one campaign, one subject, the Work Saban brand, no personal accounts, no ad spend, at most one post per cycle and at least 72 hours between Facebook posts. It expires January 31, 2027. It may be revoked independently in the private Passport runtime.

This editorial authorization is **not** a Facebook token, an attested account connection, a live service lease or proof of publishing. The private Systemia runtime must mint/check its own Passport grant after validating the source and then read the existing sealed credential vault. Do not fabricate a social account or grant.

## Live runtime prerequisites (no secrets in source or CI)

The owned resident supervisor must have an admitted deployment with updated main source and the following **private** environment bindings. The Evercraft Compute launcher now assigns the Work Saban state directory in its admitted workspace and passes explicit, validated operator-provided account fields to the supervisor:

| Variable | Meaning |
|---|---|
| `SYSTEMIA_WORK_SABAN_CLIP_STATE_DIR` | Persistent private directory for atomic post claims and provider receipts |
| `EVERCRAFT_CREDENTIAL_STATE_DIR` | Private Evercraft provider credential vault |
| `EVERCRAFT_PASSPORT_STATE_DIR` | Private Evercraft Passport state |
| `EVERCRAFT_CLIP_WORK_SABAN_FACEBOOK_PAGE_ID` | Exact approved Evercraft corporate Page ID, validated against provider identity |
| `CLIP_FACEBOOK_CREDENTIAL_REF` | Optional private resolver reference when vault has multiple Page credentials |
| `SYSTEMIA_WORKSPACE_ROOT` | Checked-out owned repository root |

### Operator deployment inputs

The existing first-party Yard/Core deployment can supply `passport_state_dir`, `provider_credential_state_dir`, `work_saban_facebook_page_id`, and optionally `work_saban_facebook_credential_ref`. These fields are checked by the owned Compute launcher. The Page ID must be numeric and match the credential's real provider Page identity; it is **not** inferred from a social profile, post caption or product branding. All private state roots must remain within the admitted Compute root.

The runner never echoes bearer tokens. A configured state directory, a loaded source receipt, or a GitHub green check cannot independently establish that the publisher is deployed or active.

## Safe verification

From the actual owned resident deployment, run the native runner without `--fire` for a read-only due-slot check:

```bash
node systemia/clip/work-saban-facebook-resident-runner.mjs
```

Only an admitted Systemia resident invocation includes `--fire`, and it still performs current grant validation, sealed credentials resolution, expected Page ID comparison, provider Page identity readback, canonical reporter URL preflight, durable write-once claim, provider POST, first comment, and permalink readback.

A timeout or uncertain provider result leaves the candidate in manual reconciliation; replay is prohibited until provider identity is established. One provider ID is not proof of anonymous public visibility.

## Campaign and observability

The 32 editorial slots on eight proposed platforms are not 32 connected publishers. **Only Facebook** has a dedicated native company publishing runner in this release. All other platforms remain held for their own vetted adapters and rights/identity checks.

The existing six-hour read-only GitHub Clip watch reads repository queue and published receipt sources available to that runner. It **does not** read the owner's private runtime state and therefore cannot claim live Page visibility. To establish a real publication, inspect the private Work Saban claim file and independently open its `provider_post_url` on Facebook; keep separate evidence for the first comment. Do not set `published_posts_verified` or advertise revenue without matching independent evidence.

The initial launch posts on founder-controlled personal profiles were manually reported by the founder, not independent provider verification, and must never be automatically replayed.
