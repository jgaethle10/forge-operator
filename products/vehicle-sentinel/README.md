# Evercraft | Vehicle Sentinel (Jeep Sentinel pilot)

**Status: private beta source prototype, NOT a commercial tracker-detection product and NOT App Store distributed.**

This repository package contains two separate experiences:

1. `Vehicle-Sentinel-QuickCheck.html`: a **usable local-only inspection journal** that runs in a modern browser. It is not a Bluetooth or GPS scanner. Users can record a Find My check, a manual vehicle checklist, dated observations, and export TXT/JSON.
2. `JeepSentinel.xcodeproj`: **unreleased SwiftUI native source**. With an iOS device and Xcode signing, the user can initiate two BLE radio scans (beside vehicle, then away) to review relative signal strength and export the observations. It does not identify AirTags or GPS tracking devices. An optional heuristic highlights proximity differences for human interpretation only.

## Privacy

QuickCheck is a standalone HTML file. It includes no telemetry, analytics, advertisements, network API calls, image uploads, or account system. The Apple Support link works if clicked. The QuickCheck journal uses browser `localStorage` only when available; it is **not encrypted** and may be lost when browser data is cleared. Exports are user initiated. No cloud sync or backend exists. The native app source only uses Bluetooth radio advertisements while opened, and its state is local in UserDefaults (also not an encrypted forensic vault). There are no server, GPS, microphone, or camera permissions.

## What's new in v0.2

- New responsive Vehicle Sentinel QuickCheck with session timestamps, inspection progress, observed/not-observed distinction, dated evidence journal, TXT/JSON export, local erase, and no detection verdict.
- Native scan interpretation now rejects comparisons using sessions where either scan is under 30 seconds, the control scan is over 30 minutes later, scanning order is reversed, or either sample contained no BLE observations.
- A new beside-Jeep scan clears previous control sample, preventing stale cross-session matching.
- Single-location-only BLE observations no longer count as flagged proximity differences. A >=12 dB difference with three readings per location remains an **unvalidated heuristic**, not a detection model.
- Native scans are stopped and saved if the app goes inactive/backgrounded, preventing the UI from claiming a continuous scan.
- Added analyzer regression tests for positive and invalid control conditions.

## Test commands

- From this project directory (requires Swift installed):
  `swiftc JeepSentinel/Models.swift Tests/AnalyzerSmoke.swift -o /tmp/sentinel-smoke && /tmp/sentinel-smoke`
- From this project directory (requires Node 18+):
  `node Tests/quickcheck-v2.test.js`
- Real Bluetooth scan testing **requires an iPhone**. We cannot validate it with a Linux compiler or simulator alone.

## Run the pilot today

Open `Vehicle-Sentinel-QuickCheck.html` on a phone or computer in a browser. The export button may place the report in the device's downloads folder; if local storage is disabled for files or private browsing, export right away. A hosted HTTPS copy would require an actual deployment and separate privacy review.

For the Swift source, open `JeepSentinel.xcodeproj` using Xcode on a Mac, select a signing team, install on an iPhone, approve Bluetooth, and conduct 60-second near and away scans within 30 minutes. Keep the app in the foreground; leaving the app ends the scan. This build is not an installable iOS app delivered through this ZIP.

## Product limitations

- BLE scans can show nearby advertising devices. They cannot attribute signals to a tracker or detect hidden GPS reliably. Some trackers rotate Bluetooth identifiers; iOS does not give these apps hardware MACs.
- A clean scan or lack of a Find My alert cannot exclude cellular, wired, sleeping or unobserved trackers.
- Default recommendation for compatible item trackers: Apple's built-in tracking notifications and Find My.
- No automated alerts, continuous monitoring, location map, item-owner identity lookup, or backend monitoring exist.
- A professional vehicle inspection is needed when the concern involves hidden wired/cellular equipment.

## Safety guidance

If the user discovers an unfamiliar object, photograph it before touching it and ask a qualified mechanic to identify it. Never get under an unsupported vehicle or disturb unfamiliar wiring. If in immediate danger, move to safety and contact emergency services. Do not confront anyone based on an unverified signal or device.

## Commercialization gates (not satisfied)

- [ ] Confirm actual device run in iOS 17+ using multiple iPhone models and document OS versions.
- [ ] Bluetooth test matrix: ordinary accessories, benign false positives, partial scans, Bluetooth disabled/denied, app backgrounding, low-battery state and rotating identifiers.
- [ ] Separate guided detection from radio observations in marketing copy; have product safety and accessibility review.
- [ ] Legal, trademark, and IP review. “Sentinel” overlaps with an existing Evercraft Systemia internal module; evaluate a distinct consumer-facing name.
- [ ] Public privacy policy and support/contact details; App Store and platform review readiness.
- [ ] Beta testers recruited with informed consent, clear limitations and structured feedback.
- [ ] Payment checkout and refunds configured **only for accurately described validated functionality**.
- [ ] Public deployment, monitoring, analytics consent controls (if ever added), and support workflows.

**No user charges, public hosting, or App Store publication are claimed in this package.**

## Verified external references

- Apple, what to do if you get a tracker alert: https://support.apple.com/en-us/119874
- Apple Core Bluetooth scan API: https://developer.apple.com/documentation/corebluetooth/cbcentralmanager/scanforperipherals(withservices:options:)
- App Store Review Guidelines: https://developer.apple.com/app-store/review/guidelines/