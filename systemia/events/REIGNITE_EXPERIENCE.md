# REIGNITE | One easy next step for every person

Canonical: Tillamook project #2546; existing Evercraft Events coordination #2547; website/layout PR #2553. This file defines the **product experience contract**, not permissions or a separately launched platform.

## The non-negotiable interaction rule

Each person should see **one clear, relevant next action** on their phone. The platform handles revision history, safety checks, team routing, forms, evidence and scheduling behind the scenes. No one should have to understand Systemia, Saban, Opportunity Fabric, JSON, GitHub, the full permit plan or our infrastructure to contribute.

The participant sees *why the event matters, what is being requested now, what comes next, and whether their action was received*. Avoid dashboards before there is a task; no duplicate profile entry or repeated emails. Explicitly distinguish **idea received**, **under review**, **accepted for planning**, **contracted**, **event approved** and **complete**.

### Who sees what (future authenticated flows)

| Person | First thing they should see | Next action | What they should not need |
| --- | --- | --- | --- |
| Artist / DJ / performer | A clear global creative invitation and actual eligibility/status | Share sample and performance idea when applications legally open | Venue CAD, organizer notes, other contributors' data |
| Visual artist / photographer | Exhibit or contest guidelines and permissions | Suggest an installation or submit agreed materials | Contracting/permit dashboards |
| Food / merchandise vendor | Available categories, operating expectations, required licenses | Express interest; upload required documents only after authorized intake opens | Other vendors' contracts |
| Producer / stage partner | Only assigned stage/zone and dependency list | Confirm scope, equipment, load-in needs, technical files | Irrelevant festival departments |
| Sponsor / auction donor | Verified beneficiary, proposed impact and exact permitted offer | Choose a sponsorship/donation package after agreements exist | Custom email chains |
| Museum / preservation reviewers | Location evidence, event safety holds and proposed changes | Comment/approve or reject *within their real scope* | Evercraft engineering backend |
| Volunteer / staff | Their own shift, location, contacts and check-in instructions | Accept assignment and receive day-of details | Complex event planning |
| Evercraft owner | One reviewed queue, blockers and release readiness | Accept/reject one exact change with reason | Duplicated spreadsheets, copied requests |

No applications, bookings, donations, staff invitations or authorized programming are live simply because these flows are described.

## Implemented now in the layout-source PR

The top of the REIGNITE layout studio now asks only:
1. What kind of experience?
2. What should we call it?
3. Where might it go?
4. A short sentence about it.

This is one straightforward **one-minute idea** interaction, not a survey. Behind the scenes the software chooses a category, creates an unverified placeholder zone, leaves capacity and real position unapproved, and generates a proposed review reason. If the owner-operated local service is connected, one click submits a pending owner-review proposal. If it is not connected, a person can preview and export their draft without entering a key. Advanced geometry and technical forms are hidden behind *Show advanced layout tools*. No previous edit should disappear when an invited user connects.

**Evidence boundary:** The actual current Hangar B site plan and event-use approvals are still missing. A small form does not certify a location, confirm performer participation, enroll a vendor, reserve an area or allow funds to be collected.

## UX targets to test (goals, not observed metrics)

- First conceptual idea created in under 60 seconds by a new participant, with no coaching.
- On mobile, first viewport states the purpose, action, and approval status.
- Contributors can complete the simple flow without ever opening advanced technical fields.
- Explicit confirmation after successful receipt; distinct explanation for local preview vs actually submitted.
- Preserve drafts across connection attempts and fail closed on stale map revisions.
- A contributor can see whether a suggestion is pending, declined, or merged for planning without requiring a phone call.
- Each participant receives a single latest source of truth for their own tasks and schedule, not multiple overlapping messages.
- Accessible labels, keyboard operation, readable contrast, reduced motion and screen-reader status.

## One-stop organizer home (now in site-source review)

The REIGNITE concept page links to `public/reignite/organizer/index.html` with **just two organizer choices**: review the current blockers or examine proposed venue zones and contributor suggestions. This is a routing page, not another copy of the safety checklist, new CRM, task dispatcher or account system.

**Safety of incomplete integration:** the canonical readiness preview exists in separate draft Events PR #2548 at `public/reignite/readiness/index.html`. The organizer home only enables its readiness link after a same-origin HTTP read confirms that the actual unindexed, clearly non-live source preview is present. On the current site-only branch, it shows a plain statement that the two feature branches have not yet been released together. It does not send visitors to an unavailable route or silently replace the source preview with invented permit statuses.

The existing protected layout editor remains the sole write/review path, under `/reignite/layout/`. Invited contributor sessions stay scoped to their own ideas; the organizer home itself has **no credential entry, private data, publishing, payment or authority to approve areas**. A successful GitHub build is not museum or event permission.

**Release gate:** PR #2548 (Events rules/readiness) and PR #2553 (site/layout/organizer home) must both undergo review and enter the same authorized Evercraft-owned artifact bundle before the readiness link is presented as available. Verify owner-only paths, local mobile browser behavior, same-origin routing, CSP and site-approved public visibility before deployment. No public launch is requested by this planning-only change.

## The next release increments

1. **Trusted remote invited access:** replace copy-paste local keys with a simple owner-issued, short-lived, one-tap session on an Evercraft-owned HTTPS origin using actual Identity/Passport/Interaction Ledger security, with scoped view/submit/review capabilities, expiry and revocation. No raw secrets in public URLs, query parameters, GitHub or logs.
2. **Participant self-service:** role-specific single-task surfaces and progressive disclosure. Only ask for licensing, identity documents, travel, insurance, equipment files or payment details when truly needed and handled privately. No premature intake before verified event authority.
3. **One action queue:** existing Systemia/EveryStage/Opportunity Fabric evaluates submitted ideas and legal/safety dependencies and proposes reviewed work packages. It must never interpret a planning review as venue/structural/permit approval.
4. **Day-of simplicity:** mobile-friendly personalized schedule, location, approved load-in route, contacts, safety brief and change notices. Provide offline-safe/printable fallback where appropriate.
5. **Pilot with real humans:** run a supervised usability test involving one first-time creative contributor, one operator and one museum/engineering reviewer. Measure actual completion time and confusion, then revise before live publication.

**Core rule:** people should remember the event, not the paperwork.