# Passage: prototype threat model and release constraints

Status: internal early-stage assessment, not independent security review or a guarantee of user safety.

## Reader safety
Passage is currently a public-interest *demo reader*, not a secure communication channel. In a restricted environment, merely accessing the web host may be observable to network operators. A shared or searched device can expose browser cache, downloads, bookmarks and reading history. No anonymity, anti-forensics or encryption is implemented.

## Assets and trust boundaries
- Reader safety and privacy; provenance and edition integrity; publication rights; offline accessibility.
- The web origin is trusted to deliver static HTML, scripts and catalog. A compromised host could replace all of them; HTTPS alone does not make editorial content true.
- Search is processed client-side. Saved bookmarks are localStorage entries on the device. Downloads and browser caches are unencrypted.
- Third-party references are external destinations. Passage does not fetch, save, license or certify their content.
- Existing Evercraft network continuity prototypes have different trust boundaries. Their research and lab results do not authorize public publishing or high-risk transport.

## Failure modes and current controls
| Risk | Current control | Remaining limitation |
| --- | --- | --- |
| Offline information becomes outdated | Visible edition, offline staleness warning, network-first catalog updates | Saved standalone copies cannot be recalled or revoked |
| Malicious text in the catalog | DOM textContent, escaped export, schema validation, restrictive browser CSP | Origin and editor remain trusted; source review required |
| Unlicensed third-party redistribution | Original internal demo text and explicit rights limitations | Rights-clearance and a takedown process not yet established |
| Reader identity exposed by visits | No registration, tracking scripts or user uploads | Host/network logs and device traces still possible |
| Browser offline caching fails | Secure-context service worker and standalone export | Browser storage eviction, first-use connectivity, mobile platform variability |
| Confusion about censorship resistance | Clear prototype disclaimers | No peer networking, Tor, encryption or bypass has been built |
| Safety-critical outdated guidance | No emergency or operational guidance bundled | Future editorial policy and corrections required before expansion |

## Required before high-risk distribution
1. Independent security and digital-rights review for actual threat scenarios and intended jurisdictions.
2. Clear publishing governance: responsible editor, source validation, redistribution rights and correction/takedown procedures.
3. Real iOS Safari, Android Chrome, desktop, poor-network and complete-offline device testing.
4. Transparent hosting and support policies with no false assurances of unobservability.
5. Content audit to exclude nonconsensual personal records, dangerous illegal material and harmful location-sensitive operational data.
6. Independent validation before any signed packages or authorized peer-delivery transports; no source bundled with untrusted credentials may authorize itself.

Go/no-go: No public recommendation for readers at heightened risk until all applicable gates are met. The current draft may be used only for internal QA and editorial evaluation.
