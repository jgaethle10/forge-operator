# Evercraft Customer Experience & Public Release Standard (CX-001)

**Version:** 1.0 · **Established:** November 17, 2026 · **Applies to:** all Evercraft-built customer-facing sites, landing pages, inquiry/booking paths, paid-product doors, checkout flows, bilingual surfaces, and owner-review previews.

**Authority:** This is the operational interpretation of [DESIGN.md](../../DESIGN.md), [Client-Facing Simplicity](./CLIENT-FACING-SIMPLICITY.md), [Customer Gauntlet](../../systemia/customer-gauntlet/README.md), and [external-action authority](../../systemia/operator-gates/README.md). It **adds concrete release gates; it does not replace product-specific brand, payment, security, licensing or publishing policies.**

**Doctrine:** Design and test as an actual customer with a task, never as an engineer admiring source code. A static pass is not a visual pass, an HTTPS 200 is not a functioning business, a click is not a booking, and an inquiry is not revenue.

## 1. Who owns what

| Role | Owns |
| --- | --- |
| Client / brand owner | Identity, service/menu/price/area/claims accuracy, rights, final customer-facing approval; no obligation to use preview or change an existing website |
| Evercraft / Fallen Studios | Design, implementation, link/copy checks, source/media provenance, test evidence, approved deployments and handoff |
| Systemia | Release state, mission routing, authoritative admission/trace |
| Saban | Bounded parallel QA and engineering assignments, never fictional executions |
| Customer Gauntlet / Human Experience Sentinel | Independent task-to-result, accessibility and screen-size proof |
| Passport / authorized operator | Consent, publication, external messages and paid/ad spending authority |

**Never ask a client to retype facts already sourced and verified**. Reconfirm only information that may have changed, is disputed, or needs explicit approval to be published.

## 2. Mandatory customer-journey contract

A stranger arriving from a promotion must be able to answer: **what is offered, why it matters, what it costs or how to get a real quote, whether they are eligible, and what to do next** without learning about Systemia, tracking, a developer, or the client's family.

- One primary task and action in the first viewport, with an appropriate alternate where necessary; explain the journey in at most three up-front steps.
- Use professional business-facing labels (e.g., "Request service", "Email service inquiry", "Call On The Go"), not staff-only shorthand such as "Call Juan", unless owner-approved for that specific brand.
- Preserve real brand marks, assets, approved palette, recognizable business name, and tone. No generic Evercraft skin, placeholder imagery, stock pretending to be the client, or unlicensed reuse.
- No fake live availability, simulated reviews, fabricated sales, staged client activity, or call-to-book CTA that implies a completed reservation.
- Distinguish client-review previews from customer-live experiences. An unlisted public URL is **not** access-controlled.
- Customer-facing surfaces must never display internal referral hashes, Beacon architecture, ledger terminology, QA receipts, technical source codes, internal pricing experiments or other operational clutter.
- Do not put a complicated sign-up form, unnecessary data collection, or a forced phone call in the path of a simple inquiry.

## 3. Device-specific functional standards

**Desktop/laptop (at least 1280–1440 px test viewport):**
- The primary CTA may **not depend on a telephone dialer**. It must open a real usable on-page contact route, email flow, accessible appointment request (only if functioning), or another clearly usable desktop outcome.
- A visible business email address and copy option are recommended for service inquiries. If using mailto, do not assume an email client is installed. Provide the address in plain text as a fallback.
- Phone links may be offered as an **alternative** and must include a readable number, but can't be the only working contact path.
- Validate desktop navigation, service choice, keyboard use, bilingual toggling, the full inquiry handoff and no horizontal overflow.

**Mobile (at least 375–390 px test viewport):**
- One prominent thumb-friendly action. `tel:` may be primary when it's a legitimate customer channel, but users must also have a non-call alternative if the service supports one.
- Sticky controls must not obscure content, buttons, prices, footer, system safe areas or page anchors.
- Tap targets at least 44 × 44 CSS px where practical; controls must have visible purpose and focus.
- Test tap targets, language switch, long labels, selected service propagation, keyboard/screenreader labeling and horizontal overflow.

**Tablet (at least 768 px) and narrow desktop (at least 1024 px):**
- No accidental mobile/desktop mismatch where a phone-only CTA becomes primary.
- Headers, service cards, pricing and inquiry blocks must remain legible and reachable.

**No “device parity” by assertion:** record actual observed behavior for desktop, phone and tablet/narrow views. A green unit test alone is not visual proof.

## 4. Content, bilingual quality and commercial facts

- Only quote a **published or owner-approved** service, price, fee, inclusion, coverage area, hours, qualification or testimonial. If a published fact is unconfirmed, make the caveat visible and flag the owner decision before promotion.
- Starting price must read as **starting**. Preserve exclusions, additional charges, travel/location considerations and customer-supplied-material conditions. Never promise the published price is a final quote.
- Each language must have complete navigation, pricing/terms, selectors, buttons, FAQ, legal/consent information and inquiry copy. Do not translate only the hero while leaving the conversion flow untranslated.
- Have a bilingual human review idiomatic phrasing and service/technical terms before client-facing launch where possible. Machine-translated/assistant-written text alone is not a native-speaker certification.
- English and Spanish selections must arrive in the correct language and remain selected after changing language, scrolling or pressing the CTA.
- Human owner/client review must verify identity-sensitive assets, logo, contact channels and any claims before broad promotion.

## 5. Privacy, permission and payment honesty

- Default to the minimum customer information. No sensitive data, analytics, new forms, trackers, payment connections, CRM access, cookies or third-party scripts merely because they make a demo look advanced.
- If first-party event measurement is later introduced, document collection, purpose, notice, permissions, retention, access, and meaningful opt-out where required **before launch**.
- Keep technical logs and proofs internal. A generated code is not a customer, a `tel:` click is not a call, a mailto is not an inquiry until sent, an inquiry is not an appointment, an appointment is not a paid service.
- No marketing outreach, commercial asset reuse, client-site mutation, external posting or new financial terms without appropriate exact-scope approval. Preview feedback is not a publishing license.
- No retroactive revenue share or invented attribution. Owner-reported payment is labeled owner-reported, not independently verified.

## 6. Acceptance test matrix: evidence required before release

| Gate | Test and evidence | Pass means | If not tested |
| --- | --- | --- | --- |
| A. Brand & source | Compare rendered logo, colors, media, business name, prices/claims with source and authorization | Business identity and facts match | BLOCKED |
| B. Desktop task completion | At 1440 and 1280 px, complete service selection → usable inquiry by email/contact. Test email fallback with no configured mail client | Desktop visitor can contact business without telephony | BLOCKED (P0 for phone-only) |
| C. Phone task completion | At 390 and 375 px, complete service selection → call option **and** alternate inquiry | Actions readable, work and don't obscure content | BLOCKED |
| D. Tablet/narrow desktop | At 768 and 1024 px, inspect navigation, services, CTAs and overflow | No breakpoint-specific broken path | BLOCKED |
| E. Localization | Repeat full paths in **each offered language**, verify source→contact language/selection | No mixed-language or missing inquiry copy | BLOCKED |
| F. Keyboard/a11y | Tab/shift-tab, visible focus, semantic labels, headings, contrast review, reduced motion | Main task possible without mouse, no obvious accessibility defect | BLOCKED |
| G. Unhappy paths | No mail client, call unavailable, no selection, long content, bad link, refresh | Understandable usable fallback, no invented success | BLOCKED |
| H. Source/CI | Run repository tests, business-path static checks and relevant Customer Gauntlet | Technical regressions absent | BLOCKED |
| I. Exact public bytes | After deployment, independently fetch **exact final HTTPS URL** and verify expected version and links | That version is publicly served, not just committed | BLOCKED |
| J. Client/publication | Explicit owner approval for identity, claims, services and promotion; authorized publication receipt | Cleared for actual customer traffic | BLOCKED |

Evidence packet should contain: commit and PR, source facts, permission/asset refs (private), mobile/tablet/desktop screenshots (private if sensitive), browser interaction transcript, failed cases and remediation, link/call/mailto tests, accessibility review, CI run, exact public URL HTTP receipt, and client/Passport approval status. **No screenshot or evidence packet = not a visual PASS.**

## 7. Severity and release state

- **P0 / HOLD:** wrong or broken money/contact route, phone-only desktop journey, false booking/payment claim, wrong recipient, leaked customer data, false business price, major unusable language variant, unauthorized branding/publication, or live client changes without approval.
- **P1 / REPAIR BEFORE PROMOTION:** clipped/mobile overlay, hidden content, inaccessible critical button, misleading copy, untranslated conversion action, untested breakpoints, unsafe fallback or missing image-rights evidence.
- **P2 / BACKLOG:** optional polish after all critical paths are proven and client has approved the scope.

`source_pass`, `browser_pass`, `preview_live_verified`, `client_approved`, `promotion_authorized`, and `paid_result_verified` are **separate states**. Never collapse them into “done”, “live for customers”, “bookings working”, or “revenue generated”.

## 8. Client 001 concrete enforcement

Client: **On The Go Mobile Quick Lube**. Owner-review path: `public/clients/on-the-go/review/index.html`; current public preview: https://jgaethle10.github.io/forge-operator/clients/on-the-go/review/

- Desktop header/hero **Request service** routes to a customer contact area (not direct dialer).
- Email inquiry is visibly above the phone action on desktop. The published business address is readable and copyable if the mail handler is unavailable.
- Phone link `tel:+15098335025` is kept as an option, especially mobile, with professional **On The Go** language.
- No "Call Juan", "Llamar a Juan", internal referral panels or technical identifiers in public CTAs.
- All eight published packages and the six guided combinations are reproduced with applicable **starting** prices and visible service conditions. Do not silently change service terms.
- Language switch works through service selection and final inquiry on mobile and desktop.
- Four FAQs, genuine authorized media and the owner story remain intact.
- No claim of live booking, active attribution, completed sale or consent to advertise; reviewed design is not a promotion approval.

**Automated source preflight:** `node --test tests/client-experience-contract.test.mjs`. This checks non-phone desktop CTA targets, non-call fallback, business-facing copy, language, and customer privacy boundaries for Client 001. CI checks this on relevant PRs.

**Important:** Automated source preflight cannot render pixels, test external email client software, attest to the truth of published service claims, replace native-speaker review, or grant publication authority. Use Customer Gauntlet/owned browser receipts and explicit owner approval for those gates.

## 9. Reuse pattern for every new client

Copy this **release process**, not On The Go's palette, logo, prices, phone number or industry assumptions. Keep a per-client config/profile with identity, audience, authorized imagery, locale(s), truthful offer, contact route by device, current consent, and exact release URL. Add the client's own executable contract/tests. Any new customer-facing page missing a client-specific acceptance contract is **review-only** until one exists.

---

**Primary question before release:** Could a tired customer complete the business task on their actual device, without knowing the business owner's first name, Evercraft's internals, or having to call someone who isn't available?

If not, we have more work to do.
