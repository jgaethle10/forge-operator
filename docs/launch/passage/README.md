# Evercraft Passage: offline-first public-interest reading prototype

**Status (2026-10-29): branch prototype. NOT a public release, censorship circumvention service, anonymity tool, verified content relay, or emergency broadcast service.** Passage is an independent product surface under Evercraft, not an extension of Work Saban, Research, or the community-radio field experiment.

## Run
From a repository checkout, use an ordinary static server to serve /public as a site root, then open /passage/. Browser service workers require HTTPS or localhost. Do not test from a file:// origin.
For example on Node 22+, run a static server of your choice bound to loopback and navigate to /passage/.
Library unit tests: node --test tests/passage-library.test.mjs

## Delivered in v0
- Mobile-first, keyboard-friendly catalog and reading view with search and category filters.
- Five original educational demonstration guides with rights labels, edition dates, and further-reading sources.
- Text download per guide.
- One-file standalone HTML export of the complete example library for individual offline use; does not require JavaScript/network once downloaded.
- Browser-local bookmarks, no server account or analytics.
- HTTPS service worker caches the shell and example catalog after a successful initial install (not the external linked sources).
- No telemetry or remotely loaded third-party scripts.

## Boundaries
- Not a censorship-bypass tool. No Tor connection, bridge, proxy, mesh networking or P2P stack is implemented.
- This is not an anonymity, encryption or anti-forensics product. A local saved file, browser cache or bookmark can be discoverable. Hosting/network operators can observe initial site access.
- Browser cache can be cleared/evicted by the user or operating system. First use requires connectivity; the offline export is the predictable offline path.
- Download/share of external news, academic works, or books is not enabled. Original demo text is NOT accompanied by a broad public redistribution license; permissions require an Evercraft rights decision.
- No independent validation of linked further-reading pages, third-party editorial content, safety instructions or metadata is implied.
- Avoid collecting or hosting high-risk, personal, illicit or sensitive information.
- Do not claim this branch is deployed, published or externally reachable until public HTTPS and offline checks are observed.

## Integration with existing Evercraft infrastructure
Read systemia/network/OFFLINE-CONTINUITY.md and systemia/network/COMMUNITY-RADIO-LOCAL-PORTAL.md before adding transports. Passage can consume future permission- and integrity-verified transport adapters, but must not copy authorization or safety claims from laboratory continuity tests. Any signed packages need an out-of-band trusted public key, revocation/expiry, provenance, rights records and abuse controls.

## Release gates
1. Confirm product name and trademark assessment, editorial/rights policy, and governance.
2. Verify the catalog's sample source links, copy, accessibility and responsive layout.
3. Test browser install/refresh completely offline on real iOS, Android and desktop browsers. Test the standalone export while fully offline.
4. Get an independent threat model and security/privacy review with digital-rights organizations before serving at-risk readers.
5. Establish content authenticity, corrections, rights clearance and deployment-monitoring policies.
6. Verify real public origin, availability, no analytics, and a published support channel.
