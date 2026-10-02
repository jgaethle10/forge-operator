# Systemia Opportunity Fabric

Systemia Opportunity Fabric is the reusable matching and execution layer for turning incomplete assets, skills, capacity, and needs into protected partnerships and executable work.

It is intentionally broader than a vendor directory. A participant can arrive with designs, songs, demos, equipment, manufacturing capacity, customers, distribution, expertise, facilities, inventory, intellectual property, or an unfinished project. The fabric matches complementary parties without requiring either side to know the entire production chain in advance.

## Core model

`HAVE -> NEED -> CAPABILITY -> CAPACITY -> OPPORTUNITY -> AGREEMENT -> EXECUTION -> RECEIPT`

Examples:

- a designer with finished art can find printers, apparel partners, retailers, or licensing partners
- a musician with demos can find producers, studios, session players, mixing or mastering support
- a printer with idle capacity can find appropriately specified work without seeing protected artwork before authorization
- a contractor can assemble a subcontractor chain instead of rejecting work outside its direct trade
- a business can bring an outcome and let Systemia assemble the temporary team required to execute it

## Execution blueprints

v1.2 adds a safe pre-assembly planning stage. An opportunity owner can ask Systemia to turn the opportunity's safe metadata into an execution blueprint before the owner knows who the team should be.

The trusted runtime reads only the opportunity's stated needs, desired partner description, safe HAVE metadata, title, description and location plus members' public capability metadata. It does not inspect Creator Vault records, protected assets, formation snapshots, disclosure grants, private contact fields or protected file content.

For each stated gap, the planner proposes a bounded work package and ranks up to three current network members whose public capability metadata appears relevant. It returns no contact email. If no member fits a capability, the gap stays unresolved rather than inventing a partner.

A blueprint is a recommendation, not membership, qualification proof, authority, license or agreement. Contacting a suggested candidate still begins with the protected `ConnectionRequest` handshake. Accepted relationships are still required before team assembly.

Blueprints are persisted in an owner-private `ExecutionBlueprint` ledger. The plan id is derived from the safe project and candidate evidence. Re-running identical evidence reopens the same ledger record instead of creating duplicate workflow truth, while materially changed capability evidence produces a new plan id. Each new ledger record links to its `FabricEvent` receipt.

The execution flow is therefore:

`SAFE OPPORTUNITY -> BLUEPRINT -> PROTECTED CONNECTIONS -> TEAM INVITATIONS -> WORK PACKAGES -> FORMATION / RIGHTS GATES -> EXECUTION`

## Sourcing desk

v1.3 adds the commercial-capacity bridge between a blueprint match and team formation.

After a protected connection is accepted, the opportunity owner may send a bounded `SourcingRequest` tied to the exact blueprint, suggested work package and candidate. The recipient can answer with availability, estimate or firm-quote mode, amount/currency, lead time, availability date, validity date and a safe constraint note.

Sourcing is deliberately non-binding:

- creating a sourcing request creates no payment obligation
- returning a quote does not accept work or create a contract
- shortlisting a response does not create team membership
- protected material remains undisclosed
- only `Available` or `Limited` responses can be shortlisted into team assembly
- selected sourcing responses must belong to one project and one execution blueprint

When a sourced team invitation is accepted, Systemia materializes the exact sourced package as `Offered` with assignee state `Not accepted`. The assignee must still accept the work package independently.

The execution flow is now:

`SAFE OPPORTUNITY -> BLUEPRINT -> PROTECTED CONNECTION -> SOURCING -> SHORTLIST -> TEAM INVITATION -> OFFERED WORK PACKAGE -> PACKAGE ACCEPTANCE -> RIGHTS / PAYMENT GATES -> EXECUTION`

## Multi-party assembly

v1.1 extends the one-to-one protected collaboration model into temporary execution teams.

A team is assembled only from accepted connection records. The trusted runtime derives and deduplicates counterparties, creates a separate team invitation for each person or business, and refuses to assign a work package until that partner accepts that specific team invitation.

The work then decomposes into bounded `WorkPackage` records. The team leader owns scope, output definition, dependencies and economics. The assignee independently accepts the package and reports progress. Neither team admission nor work-package acceptance grants intellectual-property rights or reveals protected material.

A package can declare that protected material will eventually be required while keeping `protected_material_disclosed=false`. Protected files still require their own purpose-bound authorization path.

See `multi-party.md` for the reusable execution contract.

## Non-negotiable protection boundary

The matching layer MUST NOT require protected creative material.

Discovery and ranking operate on safe metadata such as capability, asset class, quantity, genre, production method, geography, budget band, capacity, timeline, and collaboration mode.

Protected files or confidential details can be revealed only when all required gates pass:

1. the owner has affirmatively approved the specific disclosure
2. the recipient has accepted the current Creator Covenant
3. the intended purpose is explicitly allowed
4. recipient identity and authority have been verified by the calling runtime
5. a disclosure receipt is created containing the asset fingerprint, agreement version, recipient, purpose, and timestamps
6. any joint creation that may affect ownership has an agreed ownership/license/revenue allocation before collaborative work begins

The core library treats a failed gate as a hard deny.

## Creator Covenant

The machine policy lives in `policy.json`.

The initial covenant expresses the product requirements that:

- ownership does not transfer merely because material is uploaded, matched, viewed, or evaluated
- viewing does not grant manufacturing, publication, resale, sublicensing, model-training, or derivative-work rights
- confidential material may be used only for the accepted purpose
- circumvention of the originating participant or protected opportunity is prohibited by platform contract
- joint-work ownership must be agreed before collaborative creation begins
- every protected reveal produces an evidence receipt
- revocation, retention, and deletion obligations remain part of the execution workflow

This policy is a product-control contract specification. It is NOT represented as final legal language. Production launch requires counsel review of the user agreement, confidentiality terms, non-circumvention provisions, dispute/remedy language, jurisdiction, electronic assent flow, and IP clauses.

## Trust model

The verified v1.3 implementation sits behind an authenticated service-role runtime. Direct client mutation is locked for protected workflow entities, and the runtime re-verifies identity, relationship state, invitation state, and package authority before consequential writes. Client-supplied booleans or user ids must never be treated as proof of identity, signature, ownership, relationship, or authority.

Authentication, e-signature identity proof, payment authority, durable storage, protected-file delivery, and legal record retention remain separate gates.

## Public promise

**Bring your work without giving it away.**

Discovery exposes opportunity, not crown-jewel content.

## Status

v1.3 establishes metadata-first matching, safe execution blueprints, protected one-to-one formation, immutable terms snapshots, purpose-bound disclosure grants, multi-party execution teams, project-specific invitations, bounded work packages, evidence receipts, and conformance tests. The private runtime is verified, but it does not yet claim a production-ready legal agreement, payment/escrow rail, production identity proofing, protected-file delivery, or a publicly deployed transactional marketplace.
