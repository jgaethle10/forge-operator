# Evercraft | Vehicle Sentinel: Raven Nexus Safety module
Updated: 2026-11-15
State: SOURCE BETA / COMMERCIAL HOLD

## Product placement

Evercraft OS (Home entrypoint) → Raven Nexus Safety → Vehicle Sentinel.
The Jeep pilot becomes a general vehicle-safety workflow without assuming a specific vehicle or person.

- OS route: authenticated `GET /safety/vehicle`. It serves the local-only QuickCheck inspection journal.
- Status route: authenticated, read-only `GET /api/raven/vehicle-safety`.
- Raven overview: authenticated `GET /api/raven/overview` includes `vehicle_safety`.
- Shared app contract: this feature **does not** mint an Evercraft OS install-ready product package. Until a complete Capability Mesh contract and device-specific permissions exist, it remains a source pilot.
- Data: no vehicle scans, notes, coordinates, Bluetooth identifiers, or export files are sent to the server by these new routes. The browser journal may store unencrypted data in origin localStorage; its confidentiality and isolation require further review before broad release.

## Customer outcomes and staged offer

1. **Free: Sentinel QuickCheck.** Clear Apple/Android unwanted-tracker checks, vehicle inspection guidance, owner-controlled dated notes and TXT/JSON exports. Never describes the absence of an alert as proof of safety.
2. **Validation-only: Sentinel Signal Sweep.** iOS foreground, opt-in BLE advertisements and proximity comparison. No automatic identification of AirTags, no continuous background scanning, no actionable tracker verdict. Do not charge or advertise automatic tracker detection until benchmarked on real devices, devices/settings/versions and tested tracker classes. Actual device installer requires separate signing and Bluetooth permission.
3. **Proposed: Raven Nexus Safety support.** If commercially established, opt-in specialist triage, inspection checklist and referrals to verified qualified vehicle inspectors. Service availability, qualifications, customer support, fulfillment and price need independent verification. Never infer a person or motive from radio signals.

No pricing is set. No subscription, checkout, entitlement, charge, booking, automatic notification, third-party device shipment or safety-response claim is live.

## Evidence interpretation

Source presence ≠ installed app ≠ Bluetooth permission ≠ validated detection ≠ commercial readiness.
A signal difference alone never establishes that the source is a tracker.
An Apple unwanted-tracker alert deserves device-specific guidance and evidence preservation, not an accusation.
An unexplained attachment or wiring deserves safe physical inspection; avoid touching unknown circuitry.
A clean BLE scan cannot exclude sleeping, rotating-ID, non-BLE, cellular, hardwired, GPS or otherwise undetected equipment.

## Release gates

- [x] First-party source, OS/Raven read-only discovery contract, authenticated Home pilot route
- [x] Pure advisory logic that cannot identify a person or label the vehicle safe
- [x] CI checks for interface, privacy gates and observation semantics (must pass)
- [x] Cloud Xcode simulator and unsigned arm64 build previously compiled (historical evidence; not a device test)
- [ ] iPhone hardware BLE tests across permission, radio state, app lifecycle, signal movement and control environment
- [ ] Repeatable, independently reviewed evaluation of false positives and negatives, known tracker models and incompatibilities
- [ ] Threat-model the shared-origin localStorage risk; implement encryption or isolation as justified, deletion/retention choices and incident-report export
- [ ] Accessibility, localization, reliability, battery and legal/safety claims review
- [ ] Authorized Passport device capability scope and explicit per-device consent
- [ ] Verified support, fulfillment, refund terms, merchant payments and no hidden upsell
- [ ] Commercial release signoff based on independent evidence

## Architecture and owner safety

No outbound scan-telemetry pipeline exists. Evercraft OS authentication controls access to the portal, but does not grant Bluetooth or payment authority. Raven Nexus module reports source-backed status only. Sensor operations happen in the future native phone process after explicit OS permission, never via a web app or server request. Any future opt-in cross-device sync must get specific user consent, encryption, access control, retention/deletion policy, and review of domestic-surveillance abuse cases.

If a user is in immediate danger, the app should direct them to a safe place and emergency services; it does not dispatch emergency responders. Public copy must distinguish feature availability from validated protection.
