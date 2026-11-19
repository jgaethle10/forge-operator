# Fallen Studios | Private Preview Note → Saban Review Handoff

**2026-11-18. Scope: owner-local, non-executing integration.**

This connects three existing owned components without introducing another production engine:
1. **Preview Desk** records a customer's plain-language change in a private 0600 file, bound to the exact video preview SHA-256 and the version of the saved timeline.
2. **Timeline Version Vault** retains every original edit and verifies that the note belongs to the **current** project head. Stale versions require a new review and are not silently applied.
3. **Fallen conversational revision + Studio Agent** interprets a *narrow* set of voice and picture change requests, makes a reversible proposal and, after a distinct operator approval, stages **candidate requirements only**. A source video remains untouched until a separately reviewed Shot Tournament and real rendering/editing gate.

Module: \`systemia/media-studio/preview-note-saban-handoff.mjs\`

## Run on Evercraft's private operator workstation

Do not commit customer notes, media, manifests, private file paths, or operator approvals to GitHub.

Prepare a **private** JSON configuration:

~~~json
{
  "schema": "evercraft.fallen.private-note-operator-config.v1",
  "vaultRoot": "/private/path/to/fallen-timeline-vault",
  "mediaRoot": "/private/path/to/approved-mp4-previews",
  "notesRoot": "/private/path/to/review-notes",
  "ownerScopeReference": "private:reviewed-owner-project-scope",
  "manifest": {
    "schema": "evercraft.fallen.private-preview-desk.v1",
    "projectId": "customer-project-001",
    "previews": [
      {
        "projectDigest": "<verified existing timeline-vault SHA-256>",
        "relativeMediaPath": "cut-2.mp4",
        "mediaSha256": "<verified exact MP4 file SHA-256>",
        "privateReviewAuthorized": true,
        "reviewAuthorityReference": "private:operator-authorized-preview",
        "label": "Cut 2"
      }
    ]
  }
}
~~~

The configuration's \`private:\` references are operator-supplied claims, **not independent identity authentication, customer consent or rights verification**. The caller must already have these authorizations, and the preview manifest's exact MP4 must exist. The review note ID comes from a **real** Preview Desk save action, not a fabricated status.

### Phase A: proposal, no production authority

~~~bash
node --import tsx systemia/media-studio/preview-note-saban-handoff.mjs \
  propose /private/owner/preview-config.json \
  <review-note-uuid> /private/owner/proposed-revision.json
~~~

The saved packet records note ID/digest, original preview SHA, unchanged project version/digest, clarification/approval status and the actual Fallen conversational-revision proposal. \`AWAITING_OPERATOR_APPROVAL\` is not production admission; \`NEEDS_OPERATOR_CLARIFICATION\` must be resolved without spending.

### Phase B: explicitly operator-approved candidate staging

After an authorized operator independently reviews and approves the proposed change:

~~~bash
node --import tsx systemia/media-studio/preview-note-saban-handoff.mjs \
  stage /private/owner/preview-config.json \
  <review-note-uuid> /private/owner/proposed-revision.json \
  private:separate-operator-approval /private/owner/staged-candidates.json
~~~

The bridge reads the **same** review note and MP4, verifies the original media file hash again, independently recalculates the proposal, checks the current vault head and exact proposal digest, then calls the **existing** \`stageApprovedConversationalRevision\`. It writes a new 0600 JSON output with candidate needs and receipts, never overwriting a prior output.

The \`stage\` operation **does not dispatch real agents, run inference, change any files in the video timeline, audition voices, publish to Clip, charge money or contact the customer**. Those jobs remain future authorized steps. Generated visuals would require the existing Shot Tournament and quality/rights gates. Operator approval references in the current local pilot are not cryptographically authenticated.

## Tests

~~~bash
node --import tsx --test \
  systemia/media-studio/preview-note-saban-handoff.test.mjs
~~~

Tests create real local review-note artifacts through the Preview Desk POST route using synthetic MP4 transport bytes, prove exact binding to its saved timeline version, gate staged candidate instructions separately, reject stale vault heads/tampered notes/forged approval/stale or mismatched media, and verify voice changes route to human audition rather than altering picture. The MP4 fixtures are **not playable production footage**; these are contract and file-integrity tests, not customer playback or commercial quality acceptance.

## Next actual customer launch milestone

An owned identity-verified customer portal and project authorization layer must protect the private review experience, with an audited pathway for customer signoff, rights, usable preview renders, Shot Tournament output, native voice auditions, final master quality acceptance and private delivery. No self-service or commercial completion may be claimed from the local bridge alone.
