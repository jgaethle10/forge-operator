# Opportunity Fabric Multi-Party Execution Contract

Version: v1.2  
Evidence state: private runtime verified  
Authority: Systemia Opportunity Fabric / trusted service-role runtime

## Purpose

This contract turns a set of mutually accepted one-to-one relationships into a bounded temporary execution team without weakening the creator-protection boundary.

The team is not a social group and is not an automatic partnership in the legal sense. It is an operational container for an outcome, participant invitations, bounded work packages, dependencies, progress, evidence receipts, and later agreement/payment rails.

## Pre-assembly planning rule

Before a team exists, the owner of an opportunity may request an execution blueprint.

The blueprint must be derived from safe opportunity metadata and public member capability metadata only. It must not read protected asset records, private contact information, formation terms, disclosure grants or protected file content.

The planner may:

1. identify explicit capability gaps from the opportunity's stated needs
2. propose bounded work-package shapes
3. rank current members whose public capability metadata appears relevant
4. preserve unmatched capabilities as open network gaps
5. prepare a protected connection request to a suggested candidate

The planner may not:

- declare a suggested candidate qualified, available, willing or contracted
- enroll a candidate into a team
- expose contact information
- transfer rights
- bypass the protected connection handshake
- fabricate a partner when no real match exists

A blueprint recommendation is not team membership.

## Admission rule

An execution team may be proposed only from one or more existing `ConnectionRequest` records that are already in `Accepted` state.

For every source connection the trusted runtime must:

1. verify the current user is a participant in the accepted connection
2. derive the actual counterparty from the record rather than trusting a client-supplied user id
3. reject self-counterparties
4. deduplicate counterparties before invitations are created

A prior accepted connection does not automatically enroll that person into a new team.

## Team invitation rule

Every counterparty receives a separate `TeamInvitation`.

A team invitation is project-specific. The invitee must independently accept that team invitation before they can receive a work package for that team.

Declining one team invitation does not revoke the underlying accepted relationship.

Team invitation creation, acceptance, decline, and withdrawal are trusted-runtime actions and produce evidence receipts.

## Work package rule

A `WorkPackage` is the smallest bounded unit of execution.

A package must specify:

- team
- assignee
- title
- required output
- safe input summary
- capability requirements when known
- dependencies when known
- package economics when known
- due date when known
- whether protected material will eventually be required

The trusted runtime may create a work package only when the assignee has accepted the specific team invitation tied to that team.

The leader defines scope and economics. The assignee independently accepts the package and reports execution progress.

Package acceptance does not modify ownership, license, confidentiality, or protected-material rights.

## Protected-material rule

Team formation and work-package assignment do not disclose protected material.

A package may declare `protected_material_required=true` while `protected_material_disclosed=false` remains true as a safety invariant until a separate protected-disclosure workflow is satisfied.

A future work-package-specific disclosure must bind:

- the protected asset fingerprint
- the intended recipient
- the work package
- the governing immutable formation/agreement snapshot where applicable
- the permitted purpose
- the prohibited uses
- owner authorization
- recipient acceptance
- a durable receipt

Actual protected-file delivery is not enabled or claimed in v1.2.

## Authority model

The following workflow entities are direct-client mutation locked in the verified v1.2 runtime:

- ConnectionRequest
- ProtectedAsset
- FormationDraft
- FormationSnapshot
- ProtectedDisclosureGrant
- ExecutionTeam
- TeamInvitation
- WorkPackage

Clients receive only the read access needed for their role. Consequential mutations run through the authenticated Opportunity Fabric service-role runtime, which re-verifies identity and state before writing.

## Evidence

The verified private runtime has passed:

- Opportunity Fabric security smoke
- cross-industry matching smoke
- authority contract test
- application lint
- Vite production build

Verified cross-industry examples include:

- designer ↔ printer
- musician ↔ studio
- printer ↔ apparel opportunity

## Non-claims

v1.2 does not claim:

- a final legally reviewed Creator Covenant
- signed contract execution
- payment or escrow
- automatic legal partnership formation
- public transactional deployment
- protected-file delivery
- third-party marketplace liquidity
- provider pickup or recommendation by external LLMs
