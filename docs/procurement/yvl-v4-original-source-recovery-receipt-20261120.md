# YVL v4: original November 16 source located and reverified (November 20, 2026)

**Evidence scope:** Evercraft's *independent* YVL v4 prototype source, recovered from the owner's ChatGPT file Library. This is a source-custody/QA receipt, **not** deployment, buyer approval, a proposal, a qualified public-library implementation, or a payment.

Canonical project: [#2216](https://github.com/jgaethle10/forge-operator/issues/2216). Baseline source-recovery gate: [#2450](https://github.com/jgaethle10/forge-operator/pull/2450). Appendix A evidence matrix: [#2464](https://github.com/jgaethle10/forge-operator/pull/2464).

## Original archives: recovered from owner's private Library, NOT YET in GitHub

| Original filename | Bytes | SHA-256 |
|---|---:|---|
| `Evercraft_YVL_v4_Interactive_Site.zip` | 22511 | `5c6c8f5f1fff2b27a5352a96ad8b2fd1ddbb28974fb8a751906798aea9e17c08` |
| `Evercraft_YVL_v4_WordPress_Theme.zip` | 27194 | `d0aad7d608ceb92bbd50d0891b7bd05d0f27e6e79c565e8bf2697138ad1bfb70` |
| `Evercraft_YVL_v4_Content_Plugin.zip` | 2270 | `6f4f210c8ba6066feac3d39671b00fa2ae795293ea09946a6ac2326587e2901a` |
| `Evercraft_YVL_v4_Engineering_Pack.zip` | 979056 | `6065e63ff75a0b5a13a7227760891a920401095a68ca61e0b6aca74a85ccf23b` |

**Custody note:** The four named Library files carry November 16, 2026 creation timestamps. Read into an isolated private work area, SHA-256 hashed, scanned as ZIPs before any extraction. All four ZIP CRC checks passed; no traversal, archive symlink, encrypted entry, or suspicious compression ratio was seen. Do not infer prior commit identity, current deployment, or client custody from matching filenames alone.

## Fresh QA re-run on recovered bytes

- Engineering pack manifest: **37/37 SHA-256 and byte-size entries matched**.
- Standalone site, theme and plugin ZIP contents: **5/5, 14/14, and 2/2 matched** the corresponding originals in the engineering pack byte-for-byte.
- PHP: **10/10** theme/plugin files passed `php -l`.
- JavaScript: standalone and theme app scripts passed Node syntax checking; logic test passed **15 branches, 6 journeys, 13 resources**.
- WXR inventory parser synthetic test passed.
- HTML/CSS/source QA passed with zero reported errors.
- Actual headless Chromium DOM QA passed at **320, 390, 768 and 1440 pixels**, with six tasks, catalog handoff, service search, mobile menu, event filter and no overflow at tested widths.

The browser test is an **offline DOM** test, not an HTTP staging/production test. Source examination and static QA do not establish WCAG 2.2 AA compliance, VPAT/ACR, a production WordPress install, authorized YVL data, or live integrations. The prior history recorded in #2216 was **reverified** only for the specific tests described here.

## Next gate: canonical source import under review

1. Use only the original four ZIPs whose digests match the receipt above. Pass the existing `scripts/yvl-v4-artifact-recovery.py` source gate first.
2. Prepare an **isolated source-import branch** containing the reviewed interactive site, the *separate* WordPress theme/plugin, migration tooling and test fixtures. Never create a replacement project or rename reconstructed code as original.
3. Run license/dependency/secret checks, static tests, HTTP-browser staging QA and (separately) authorized WordPress operator/role/restore tests. Mark prototype identity independently and clearly.
4. Obtain the named substantive U.S. library-CMS partner, proof of 2 completed public-library sites and 3 authorized references before representing a qualified bid. No client contact or proposal submission is asserted here.
5. Ensure WCAG 2.2 AA/ACR, accessible PDF handling, approved branding, U.S. hosting/backups, content migration authorization, and itemized five-year pricing before any compliant client delivery.

Question deadline: **November 24, 2026**. Proposal deadline: **December 15, 2026 at 3:00 PM Pacific**. Evidence matrix qualification holds remain active. Source ZIPs and screenshots are deliberately **not** attached to this public repository in this receipt.
