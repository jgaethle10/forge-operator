# ForensiScope Ship: verified local reconstruction demo

This standalone static showcase uses an audited snapshot of the **real ForensiScope Parcel Large v0.2** engine. It generates a deterministic 26 MiB sample, prepares two pieces (16 MiB + 10 MiB), and rebuilds the exact source locally using per-piece and original SHA-256 checks. The same engine rejects a substituted or corrupt piece.

**Limits:** It does not upload, send, encrypt, scan for malware, authenticate a sender, or establish recipient delivery. The illustrative 18 MiB email target is not a provider guarantee. Do not submit sensitive or regulated material to this pilot. Use an authorized encrypted transfer for those cases.

To test on Node 22 from repository root:

```bash
node --test tests/forensiscope-ship-showcase.test.mjs
```

To view in a browser, serve the repository's `public/` directory as a static root and open `/forensiscope/ship-proof/`. Test actual deployed origin separately: an HTTP 200 SPA shell is not evidence of a working static route.

Source: ForensiScope Base44 app `6aad970f4ba83a98c73ec9f9`, `public/parcel-large-engine.js`, checkpoint `6acf2582ca22adad3f116d46` (Oct. 13, 2026). This standalone copy is a **reviewed snapshot**, not an automatic upstream sync; future engine changes must be audited and re-tested.

Related [Shipping Department bridge PR #1244](https://github.com/jgaethle10/forge-operator/pull/1244) is independent. It provides read-only canonical Shipping verification, not dispatch authority. End-to-end business delivery would additionally require recipient approval, accepted transport, provider sent-copy readback, recipient reconstruction, and acknowledgment.

**Do not publish an external marketing link to this showcase until its final hosted URL has passed unauthenticated mobile browser QA and truthful claim checks.**
