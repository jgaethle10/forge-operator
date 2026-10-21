# EVERCRAFT | Parcel Desk v0.4 | Delivery Rescue

**State:** PRIVATE pilot / locally verified + authenticated private Google Drive round-trip. Not publicly deployed, not a guaranteed email/text bypass, no sale and no external recipient delivery yet.

## 10-second pitch

**Problem:** "My file is too big to send, and my customer can't open it."

**Offer:** "We choose an allowed route, package it in a way they can receive, and verify the original is intact."

## What is actually new

1. A **route picker** guides users between approved cloud links, email attachment, chat and offline/USB handoff. It flags files over a cautious 20 MiB guideline as better suited to an approved private link. Real platform limits vary.
2. The **one-ZIP handoff** generates a single standard ZIP container with numbered parts, SHA-256 manifest, and recipient instructions, entirely in the browser. It uses ZIP *store* mode (no compression) so file sizes do not magically shrink. The ZIP is one file for a permitted cloud link or USB. Separate numbered parts remain available for channels that allow multiple pieces.
3. The **one-ZIP recipient** extracts only the app's narrowly defined stored ZIP structure, rejects unknown paths, unsafe/duplicate entries, compression types, mismatched headers and invalid CRC, then rechecks per-piece and final SHA-256 before download.
4. An **integrity check** JSON records the filename, verified bytes/hash and local browser timestamp, explicitly marking recipient identity, transport and acknowledgment as unverified.

## Test results

- 9/9 v0.4 grouped Chromium/Python assertions passed: responsive 390x844 and 1280x900 screens, channel advice, 25 MiB + 771 B ZIP verified with Python `zipfile`, browser ZIP rebuild, integrity disclosure, ZIP corruption fail-closed, external compression rejection, previous CLI test suite.
- Original CLI: 5/5 retained tests passed, synthetic only.
- **Actual connected provider storage canary**: generated deterministic synthetic 1,113,600-byte sample in the browser, downloaded a 1,115,041-byte ZIP, uploaded it to the existing PRIVATE Evercraft Google Drive commercial folder, downloaded it back through the authenticated connector, and verified the archived bytes against SHA-256 `54838ef04ceb0474586b3136370eaea3549ec44fb00fe297faf467ebdf1fd2ad`. Reconstructed original SHA-256 `14008dff0635a066baa397eae937d197be660cc7fb79dc8461fff7b588b5a5d7`.
- Browser tests ran with Playwright `set_content`. **Real public HTTPS/WebCrypto tests were blocked by the test environment's browser-network policy**, including localhost and intercepted network navigation. Browser fallback SHA-256 was verified against Python hashlib, but hosted HTTPS, Safari and independent user device tests remain open.
- **No customer data, unapproved public Drive permission changes, external recipient, checkout, sender identity proof, content safety scan, or end-to-end delivery** was involved. No real outbound messages were sent.

## How to try

1. Open `parcel_desk.html` from your computer or the downloaded working folder, select a non-sensitive file under 64 MiB.
2. Choose the permitted delivery route. Click **Prepare delivery**, then download the `evercraft-parcel-handoff.zip` ZIP row. For direct multiple attachments use the separate piece downloads instead. Never assume aggregate attachment limits can be bypassed.
3. For your own local test, select that handoff ZIP under **Easiest: choose one Evercraft handoff ZIP**, click **Verify ZIP & recover**, and compare the recovered file against the original.
4. To **actually deliver** to someone else: place the ZIP in an approved restricted-access cloud service or transfer medium, authenticate the recipient through a separate channel, confirm their access and reassembly, and keep a human-confirmed acknowledgment. Customer permission, privacy controls, virus scanning and retention terms are required for real material.

## Why this is not yet complete

Packaging is not transport. A ZIP with a 30 MiB source remains roughly 30 MiB. Email/text services still have limits, policy and security rules. A SHA-256 digest alone does not prove sender identity or that a real recipient obtained the file. The app does not encrypt, scan for malware, host, upload, email, authorize recipient access, handle billing or retain customer files. This prototype runs locally and must not be marketed as a hosted secure transfer platform.

## Systemia gates

Existing mission key: `evercraft-distribution-engine-001-20261012`; recorded QA organism state `evercraft-distribution-engine-001-parcel-desk-v04` (candidate, not an admission permit). Reuse the existing Systemia Shipping Department and ForensiScope; no duplicate specialist job created. Formal Systemia thread admission / release permit, independent recipient acceptance, real customer terms, corrected public turnaround claims, Evercraft Payments settlement and outbound AMBER clearance are still required.

## Pilot acceptance definition

**Success:** One authorized recipient who did not create the file can access an approved transport package, reconstruct the original without an engineer's intervention, show matching hash against the sender's independently conveyed expected digest, and acknowledge retrieval. Confirm terms and collected payment separately, then measure human labor time and rework before repricing the proposed $99 service.

**Do not count as success:** local preview, source ZIP uploaded to Drive, self-downloading a private object, a test checksum alone, a prospect message, an unconfirmed link click, or a Stripe link existing.

## GitHub review update | October 14, 2026

GitHub draft PR #1250 now includes a `restore-zip` command in the existing offline CLI. This bridges the one-ZIP browser sender with Python recipients without requiring them to manually extract dozens of pieces.

```bash
# Open this HTML locally for sender/recipient processing
# distribution/parcel-desk/index.html

# Or restore a handoff archive using local Python (no network required)
python distribution/parcel-desk/evercraft_parcel.py restore-zip evercraft-parcel-handoff.zip ./received

# Keep the existing parts+manifest workflow when necessary
python distribution/parcel-desk/evercraft_parcel.py restore ./parcel-parts ./received

# Run both independently scoped suites
python -m unittest discover -s distribution/parcel-desk -p 'test_*.py' -v
```

The v0.4 ZIP recipient validates an approved flat filename allowlist, disallows duplicate/unknown entries, directory traversal, ZIP symlinks, encryption or compression, bounds local sizes to 64 MiB, checks archive CRC, and then uses the original per-part + full SHA-256 verification. It refuses to overwrite an existing restored file. CLI restore-zip is a local review-only capability, not a cloud upload, malware filter, encrypted channel, identity verification, or commercial delivery service.

**Required external proof:** A separately controlled recipient account/device must access one permissioned transport and recover the original independently, using the sender's separately authenticated expected digest. Test with synthetic content first; obtain Systemia/Shipping/Security acceptance and separate Evercraft Payments verification before paid promotion.
