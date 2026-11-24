# REIGNITE | Tillamook Hangar B (independent website concept)

This is an **Evercraft-owned static website concept**, not a live event announcement. It is separate from the event-operations planner in draft PR #2548 and the project records in #2546/#2547.

## Features shipped in source

- Mobile-first editorial festival landing page, entirely self-contained HTML/CSS with semantic sections, skip navigation, visible focus styling, responsive layouts, and reduced-motion preferences.
- Global artist invitation **concept** with categories for music, art, photography, and community participation; no actual applications open, no personal information collected.
- Planning menu for outdoor stage, acoustic visual dome, sensory-reset lounge, Take the Decks, karaoke, photography/art, food and silent auction.
- Preservation-first story, four-stage readiness roadmap, current status FAQ, and links to official museum resources.
- Clear independent status and non-affiliation disclosure; no specific event date, lineup, capacity, venue license, sound hours or donations represented as confirmed.
- No external JavaScript, tracker, analytics, fonts, runtime hosts, third-party image loads, cookies, signup API or payment provider. The site links to a **real, licensed Hangar B photograph** without loading it automatically; do not substitute fabricated AI hangar imagery. Real photo: Tedder, June 26, 2022, CC BY-SA 4.0 https://commons.wikimedia.org/wiki/File:Tillamook_Air_Museum_from_air.jpg

This is **not yet deployed** and should remain unlisted (`noindex,nofollow,noarchive`) in review. The public route /reignite/ must not be published until a separate review, deployment plan and adequate ownership/non-affiliation wording.

## Local review

```sh
node --test tests/reignite-site.test.mjs
python3 -m http.server 8010 --directory public
# visit http://127.0.0.1:8010/reignite/
```

Use an actual browser at mobile and desktop widths and check focus, headings, contrast, broken links and relevant public announcements. Source tests do not constitute production quality or browser certification.

## Verified legal research, not an event permission

**Critical finding**: Tillamook County's published Ordinance No. 2 (adopted Jan 14 1970, listed as Adopted in county ordinance register), covers outdoor public music entertainment where organizers reasonably anticipate **250+ persons** and admission is paid or donation-based, **if the event footprint is in unincorporated county jurisdiction and ordinance applies**. Read the authentic source PDF: https://www.tillamooksheriff.com/DocumentCenter/View/8256/Ordinance-2

- §2.010: threshold 250+ and charge/contribution for admission; county event permit.
- §2.020: written application 30+ days before the first day, licensure limited to one day, no back-to-back licenses for same event/sponsor/premises. Other detailed historical permitting conditions require the agency to verify current enforceability and implementation; do not simply treat old fees/forms as the current process.
- §2.040: no outdoor public music 12:01 a.m. through 9:00 a.m. in unincorporated Tillamook County; attendees clear the licensed area and immediate environs by 2 a.m. of following day.
- §3: historic ordinance describes health/fire/security/parking requirements. Obtain current checklists and permitted occupancy from competent authorities.

**City limits not yet determined for proposed stage location**. The City's §130.08 noise ordinance restricts amplified sound audible within a dwelling/noise-sensitive unit **10 p.m. to 7 a.m.**, and other property-boundary noise provisions/exceptions may apply. City may issue specific variances and permits under relevant sections; do NOT assume an automatic event exemption: https://codelibrary.amlegal.com/codes/tillamookor/latest/tillamook_or/0-0-0-4976 . City right-of-way permit §130.21 specifically governs use on **public property/right of way**, not automatically a private airport parcel: https://codelibrary.amlegal.com/codes/tillamookor/latest/tillamook_or/0-0-0-5046 .

Ordinance No. 8 separately regulates dance halls in unincorporated areas; applicability to the proposed headphone-dance concepts also needs review: https://www.tillamooksheriff.com/921/Ordinances .

The Port of Tillamook Bay's Aug 20, 2026 public release describes term-sheet approval for future transfer of Hangar B operations to Vintage Aviation Museum, not an event authorization. https://www.potb.org/tillamook-air-museum-announces-partnership-with-vintage-aviation-museum .

**International acts**: U.S. State Department guidance generally excludes professional entertainment performances from B visitor classifications even when a fee is not promised, subject to narrow exceptions; qualified immigration/production advice is required before any performance contract or invitation that implies travel authorization: https://fam.state.gov/fam/09fam/09fam040202.html ; relevant P classification guidance: https://fam.state.gov/fam/09fam/09fam040214.html .

## Actual gate to go public

1. Verify exact parcel/jurisdiction and which entity has authority to permit and contract for the proposed site (Port/Vintage Aviation Museum/others).
2. Receive permission and current structural/repair/airfield constraints. Qualified PE+acoustics and fire/site review for proposed indoor and outdoor uses.
3. Confirm live permit authority and feasible music ending times in writing. An "all-night" marketing claim is prohibited until verified.
4. Establish authorized museum/beneficiary fiscal agreement and lawful donation/auction model. No event checkout beforehand.
5. Producer scopes, international artist visa/permit and IP/music license, budget and experience layout.
6. Only then activate public-facing artist intake, tickets, donation methods, announcements and indexing; use the existing authorized Evercraft Demand/Interaction Ledger/Passport/EveryStage/EventWave workflows.

The HTML currently loads no remote resources: an intentional owned-only footprint. A production design might include a museum-approved, properly licensed original photograph vendored into owned storage after permission and asset provenance checks; avoid external photo hosting as a permanent site dependency.

## Engineering source of truth

- Tillamook preservation case: #2546
- Reusable Evercraft Events coordination: #2547
- Source-only feasibility planner: draft PR #2548
- This site: a separate draft PR; no duplicate independent CRM or scheduler.
