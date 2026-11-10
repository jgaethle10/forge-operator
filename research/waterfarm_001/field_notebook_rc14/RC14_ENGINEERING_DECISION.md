# Evercraft Aqua | RC14 iPhone-preview recovery and field-evidence integrity

**Status:** Local research build. Not a deployed farm solution, not a verified iPhone Safari release, not an approved water-savings instrument, not a customer pilot.

## Source of this iteration
An owner-supplied 14.57-second iPhone screen recording (512 x 1108 H.264) shows the RC13 HTML opening in a mobile file preview, with the first-run notebook form and native units picker responding. The recording does **not** show a saved meter reading, persistent state after a preview restart, or an authorized real field measurement. Do not store or publish the owner's screen recording in the public engineering repository.

## Verified changes
- **First-screen recovery trap fixed.** RC13 backup import lived under a hidden log panel and was unavailable when the browser started without saved localStorage. RC14 shows **Import notebook file** and **Paste saved backup** on the initial screen, before a notebook is created.
- **Backup outside the file preview.** Current users can download JSON/CSV or display a selectable, copyable JSON backup. Clipboard permission failure falls back to a selected textbox for manual copying into a private note. Restoration from pasted text or JSON validates schema and fingerprint before replacing a notebook. An invalid backup leaves a working notebook unchanged.
- **No persistence guarantee.** The app explicitly says browser-managed localStorage is unencrypted and may be cleared when iOS file previews close; the app does not mark a copied/downloaded backup as safely stored. A backup only helps when the user verifies saving it outside the preview. No network uploads or third-party storage.
- **Future dates held.** A reading claiming a future date cannot be recorded or restored as if observed today. This intentionally rejects prefilled future test data from earlier versions; preserve legitimate data separately for review rather than forging dates.
- **Phone-first layout.** 390x844 Chromium emulation shows the **Start a private reading log** button with bottom at ~590 px, within the initial mobile viewport. Previously the taller hero pushed that action farther down. This is a UI test, not a native iPhone measurement.
- **Unchanged scientific constraints:** A 15-reading single cumulative source meter log yields only 14 calendar-day intervals. The instrument, capture time, calibration, water boundary, operator consent, site condition and any savings are independently unverified. Pump kWh may be unknown; missing is never zero. Daily intervals are *calendar-date adjacent*, not proof readings were exactly 24 hours apart.

## Test receipt
- 51 local Node tests passed (prior RC12/13 logic plus RC14 recovery and future-date cases).
- Desktop Chromium (1365 x 900) and phone-width Chromium (390 x 844) passed 15-entry workflow; full audit generated; source backups, copy fallback and restore by text and file from blank preview; corrupted and tampered backup rejected; future reading held; no outbound requests, JavaScript page errors or horizontal overflow.
- Browser harness uses injected HTML rather than opening a local file URL. Safari/WebKit runner executable not available; owner recording establishes only RC13 UI loading in iPhone preview, **not** RC14 native Safari or across-restart behavior.
- No external real source meter, farm, lab, licensed footage or physical device connected.

## Release gates and recommended next work
1. **Native iPhone QA:** actual Files/Safari/ChatGPT-preview cold start, read, close, reopen, export, restore (text and JSON), OS permission prompts and accessible display checks. Do not collect production/customer records in file previews until validated.
2. **Private, first-party runtime:** documented data ownership, local-at-rest encryption where feasible, backup version/migration, explicit retention/deletion and informed operator consent. Avoid third-party runtime dependencies or hosting. No remote actuation.
3. **Measuring pilot:** consenting operator and existing meter, calibration/source boundary, recorded daily reading time (currently only date is stored), 15 observations and independent raw vs audit comparison. A report cannot claim leaks, water savings or efficiency without additional causal evidence and authorizations.
4. **Scientific work:** acquire independently QC'd consecutive NOAA years and compare registered real site demand; greenhouse condensate remains a separate safely isolated trial. No official 2025 gap filling.
5. **Film:** owner asked for real footage, not AI-generated graphics. The research branch has editing and license gates, but no released live-action master.

**No user outreach sent, no field deployment, no production merge, no spending and no claim of physical water savings.**
