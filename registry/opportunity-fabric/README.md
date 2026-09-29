# Opportunity Fabric

**Provider:** Evercraft LLC  
**Product class:** protected collaboration, partner matching, and execution orchestration  
**Current state:** core protection and matching primitive implemented; public marketplace UI and production legal agreement not yet claimed live

Opportunity Fabric connects people and businesses that hold complementary pieces of an outcome.

A participant can bring designs, demos, songs, equipment, manufacturing capacity, customers, distribution, facilities, expertise, inventory, intellectual property, or an unfinished project. The fabric can match those assets to printers, producers, studios, manufacturers, subcontractors, distributors, collaborators, and other execution partners.

## Core jobs

- find a production or commercial partner for work you already created
- find collaborators whose capabilities fill a specific execution gap
- find nearby or remote studios, producers, makers, printers, fabricators, or service partners
- turn a partially solved project into an executable partner chain
- assemble several accepted partners into one temporary execution team
- split one outcome into bounded work packages with separate owners, outputs, dependencies and economics
- find productive uses for underused equipment, capacity, inventory, or creative assets
- create a protected evaluation handoff without giving away ownership or commercial rights

## Multi-party execution

The verified private v1.1 runtime can assemble an `ExecutionTeam` from multiple accepted relationships. Each counterparty must separately accept that specific team invitation before receiving work. The team leader can then create bounded work packages for accepted participants.

Team assembly, invitation acceptance and work-package acceptance do not transfer IP rights, authorize protected-material disclosure, create payment, or constitute a final signed agreement.

## Protection boundary

Public matching is metadata-first. Protected files are not required for discovery.

Protected material requires verified identity, explicit owner approval, acceptance of the current Creator Covenant, an allowed evaluation purpose, and a disclosure receipt. Joint creation requires an ownership/license/economics allocation before work starts.

The covenant is currently a product-control specification pending legal counsel review. Evercraft does not represent the draft as a final legal agreement.

## Internal implementation

- `systemia/opportunity-fabric/engine.mjs`
- `systemia/opportunity-fabric/policy.json`
- `systemia/opportunity-fabric/engine.test.mjs`
- `systemia/opportunity-fabric/multi-party.md`
- `systemia/opportunity-fabric/runtime.json`

The first implementation deliberately separates opportunity discovery from confidential disclosure so the matching system can expose opportunity without exposing crown-jewel content.
