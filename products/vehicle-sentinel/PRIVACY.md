# Vehicle Sentinel · Privacy Draft (v0.2)

**Last updated: November 4, 2026.** This document describes the current local beta builds, not a hosted or commercially distributed service. It needs a product-owner legal review before publication.

**Data collected:** QuickCheck records only what the user manually selects or types: the inspection session's times, the Find My-check status, checklist completions and written observations. The webpage does not access camera, microphone, GPS, or Bluetooth. The native iPhone prototype accesses Bluetooth advertising signals only when the user initiates a sweep, recording device identifiers provided by iOS, names if broadcast, RSSI and scan times. It does not collect GPS location or connect to accounts.

**Where data goes:** No backend, analytics service, tracking pixel, support inbox, or cloud sync exists in the delivered code. QuickCheck attempts to save its session to browser local storage; native source saves on device using `UserDefaults`. Neither is a secure evidence vault. If users choose to export or share a report, they determine its destination and the third-party app's data policy then applies.

**Retention and deletion:** The data persists in the local browser or app installation until deleted by the user, cleared by the browser, or the app's data is erased/uninstalled. QuickCheck has an erase button; the native app has Clear local observations. There is no remote copy to recover or erase.

**Third-party links:** Clicking the Apple Support link opens Apple's site under Apple's privacy practices. Loading QuickCheck itself doesn't need that link or a network connection.

**Limitations:** These tools do not establish whether a person is tracking the user. Device names/identifiers can change or be mistaken. This beta does not provide emergency monitoring, a police report, or professional forensic certification.

**Support, controller identity and public contact:** Must be finalized and supplied by the product owner before public distribution.