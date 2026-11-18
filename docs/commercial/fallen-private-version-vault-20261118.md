# Fallen Studios | Private project version vault (2026-11-18)

This adds a small, deterministic, local-only safety net for the production timeline. It is an **internal engineering primitive**, not a public customer account, secure remote database, video render, or finished rollback interface.

## Why it exists

A paying customer should be able to say "Make the ending more exciting" without risking the approved first twenty seconds or losing the previous edit. Fallen already has optimistic project versions and bounded Studio Agent mutations; this introduces a private **snapshot history** that saves exact project state after an approved mutation, and can stage a rollback as a **new version**, preserving the complete prior history.

## How it works

`systemia/media-studio/timeline-version-vault.mjs` exposes:

- `saveTimelineVersion({root,project,expectedHeadDigest,operatorScopeReference})`: writes a new project JSON snapshot with SHA-256 integrity metadata and an atomically replaced current-head manifest. Strict optimistic head and monotonically increasing version checks prevent silent overwrites. Files are created with restrictive mode 0600; project directories use 0700. The operator must create a private, existing `root` directory first.
- `readTimelineVersionHistory({root,projectId})`: verifies *all* snapshot digests and chain references before listing version/digest metadata.
- `readTimelineVersion({root,projectId,projectDigest})`: reads an exact verified old or current project.
- `proposeTimelineRollback({root,projectId,targetProjectDigest,expectedHeadDigest,operatorApprovalReference})`: proposes a new-version candidate from an existing snapshot, never silently changes the head, and rejects stale heads or conflicting locked clips/asset digests. The caller may subsequently inspect the candidate and separately save it as a new snapshot.

The first stored version must be v1. Subsequent versions must advance and provide the exact expected head digest; multiple bounded mutations may create a larger version jump. The manifest uses an exclusive write-lock directory so concurrent writes fail closed. Immutable snapshots are created with exclusive file creation; existing snapshots cannot be overwritten. The vault stores the project graph and **references** to previously approved media only. It does not copy video, prove rights, check the physical media is still on disk, generate previews, or perform a customer-facing action.

The `private:` references in this internal module are **operator-supplied strings, not authentication**. Callers must independently authenticate customer and project access and prove source-media rights; this vault must never be exposed as a public unguarded API. SHA-256 detects accidental alteration/inconsistent state but is not a digital signature or protection against a hostile local filesystem owner. No publishing, payment, generation or delivery authority is issued.

## Verification

```bash
node --import tsx --test systemia/media-studio/timeline-version-vault.test.mjs
```

Tests exercise saved v1/v2 history, one-shot replacement preserving the opening, rollback proposal and new v3, old-version persistence, exact digest conflicts, locked shot defense, symlink and file corruption rejection, and restrictive filesystem modes. This is a synthetic fixture, not an authentic customer project or a commercial video.

## Next release work

Connect the owned authenticated customer/project store, editorial review UI and version preview selector to the vault. Until customer isolation, full media bytes provenance, approved preview artifacts, and actual release gates are verified, don't claim automatic "undo" on the public site.
