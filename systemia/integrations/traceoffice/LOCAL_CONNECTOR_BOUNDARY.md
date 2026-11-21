# TraceOffice × Evercraft: proposed local metadata boundary

**Status:** design proposal for collaborator review, **not deployed and not authorization to access agent sessions**.

This is the security question Grimm-Jaw raised: an external or cloud-hosted office should not need broad access to local coding-agent sessions. The useful part of a local agent's activity is much smaller than its session files.

## Proposed minimum flow

```text
Authorized local agent source
      │ (only source-supported, opt-in status metadata)
      ▼
Per-device, per-project local adapter
      │ allowlisted fields · schema check · redact · pseudonymize · TTL
      ▼
TraceOffice snapshot v1 (local import, no network)
      │
      └──→ [optional future] consented metadata-only outbound room
                     TLS + revocable room membership + expiry + rate limits
```

The existing `bridge.mjs` converts **Saban jobs**, not coding-agent sessions. They must be labeled **job seats**. It cannot be used to claim that Cursor, Grok or any model is currently working. A separate, partner-approved source adapter would be required for actual session identity and source-specific state.

## Local source contract (proposed, not implemented)

- **Source enrollment:** explicit operator selection of one supported source/project. No implicit scanning of `~`, browser profiles or every process. Require source-specific consent where needed.
- **Minimum disclosed fields:** one scoped pseudonymous session ID, supported source name, observed timestamp, source-reported status, last-seen/expiry time and optional strictly allowlisted handoff ID.
- **Always excluded:** session transcripts, prompts, generated responses, code contents, filenames and absolute paths, clipboard, file contents, browsing history, credentials, model authentication tokens, personal email, raw host/user identifiers and inferred pricing.
- **Freshness:** no current-running claim based solely on a modified file. Missing heartbeat or expired observation becomes `unknown` or `offline` rather than `working`. File timestamp is *last observed file activity*, not proof of a live model.
- **Trust:** pseudonymize IDs using local stable secret; keep raw IDs and secret at the collector. Data shown in a room remains metadata, not an authority token.
- **Destination:** local snapshot export first. No remote upload by default. Later, each optional room needs explicit consent, source allowlist, expiry, a disconnect/revoke action and independent external canary.
- **Commands:** **none** in this version. Prompt injection, remote control, tool dispatch, filesystem writes and code execution would require separate threat modeling, approved actor identity, Passport decision, human authorization for sensitive actions, signed audit trail and replay protection.
- **Failure policy:** missing credentials, unreadable input, invalid consent scope, unknown source version, stale session or failed redaction block export or report unknown. No quietly invented healthy states.

## Demo acceptance sequence

1. Generate a **synthetic** Evercraft fixture. Test it with TraceOffice's pinned `src/snapshot.ts` parser in CI.
2. Import that exact fixture into the running TraceOffice user interface. Verify three synthetic seats and recorded synthetic edges. **Not complete yet.**
3. Share a small, mutually agreed source-state mapping with Grimm-Jaw. Never overwrite his product architecture by assumption.
4. Test a real *local only*, explicitly authorized **metadata-only** source with genuine last-seen evidence, privacy checks and deletion/revocation.
5. Decide whether any remote room, syncing or payments should exist, independently and with explicit agreements. Do not claim a subscription, signed integration, or buyer sale.

**Authority boundary:** TraceOffice visualizes selected observations; Evercraft/Systemia/Passport remain in control of execution and approvals. Neither system inherits authority just because metadata appears in the other.
