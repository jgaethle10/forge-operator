# Aiden's Lab | Public science atlas

Aiden's Lab is Evercraft's **public science exploration front door**. It is not an alternate Systemia authority, clinical-research validation system, or separate source of truth.

## What works in this proposed release

- Accessible, responsive static public interface in public/aiden-lab/
- 14 curated topic rooms spanning health/medicine, life sciences, Earth/environment, oceans/archaeology, space/flight, physics/materials, and computing/robotics
- Keyword search, category filters, random topic exploration, source-detail dialog
- A local-only saved reading shelf (browser storage, with an in-tab fallback if storage is blocked)
- Dedicated explanation of the existing biomedical evidence pipeline and scientific claims boundaries
- Explicit status distinctions for code in main, public viewer code in main, and experimental branches
- No login, analytics SDK, new backend, external publishing, patient intake, payments, or remote execution

## Source and authority contract

- **GitHub** is canonical for source code and research links.
- **Systemia** coordinates programs and release/admission gates. This static page does not bypass them.
- **Evercraft-owned Fabric/Yard** must operate the public serving route when promoted. No Base44, hosted app builder, external runtime SDK or third-party data store.
- A "public explorer in repo" label means the source path exists, not that a public origin was probed or that the service is live.
- A named research branch is not equivalent to merged code, completed experiments, or a scientific result.
- The atlas is curated, not an exhaustive automatic inventory. Add topics only after checking links and branch status.
- A visible CSS animation does **not** represent real sensor measurements, active workers, or a streaming heartbeat.

## Medical publication boundary

The linked PubMed discovery, clinical registration, evidence review and outcome-text comparison modules are research assistance. Never present their output as confirmed safety, treatment efficacy, approval, new medical discovery, or personal clinical guidance.

Before adding a clinical conclusion, independently inspect full source methods and outcomes, check retractions and trial registration links, complete qualified medical review and obtain required Systemia editorial approval. No medical claims or auto-generated clinical stories are enabled in this release.

## Local QA

From repository root, with Node 18 or newer:

  node --test tests/aiden-lab-public.test.mjs

For manual preview, serve the repository's public directory with an existing local static file server and open /aiden-lab/. ES modules do not necessarily load from a file:// URL. Check mobile, search, reading shelf, keyboard navigation, dialog Escape, reduced-motion preference and every evidence link.

## Launch gates (not yet proven)

1. Review topic text and each linked repository branch for any newly stale source; approve science/medical copy.
2. Run tests and production build. Confirm no top-level routing regression.
3. Bind /aiden-lab/ to the **existing owned public edge** through the authorized Systemia release path, preserving the main site and TLS configuration. Do not invent or claim an owned custom URL.
4. From an independent network, verify HTTP 200, TLS, page assets, search, links, mobile layout and crawl metadata. Record source commit, deploy receipt and verified public origin.
5. Only then link the site from Evercraft Research, Systemia, Journal and other public properties. Never label the page "live" based solely on a GitHub PR or a local preview.

## Next increments

- Source-of-truth public program export from Systemia that contains no private work, credentials, family details or controlled information
- Distinct publication lane for independently reviewed, citation-ready science explainers
- Optional dated "new in the lab" feed tied to source receipts, not fake counters
- Discovery and explorer quality checks, real audience analytics only under a clear privacy policy

This first release does not promise any five-minute updates or a functioning medical journal. Those require a real authorized data and editorial bridge.
