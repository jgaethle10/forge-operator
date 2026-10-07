# Lineage 5-Minute Buyer Demo

## Goal

Show one expensive AI-team failure mode without explaining the entire Evercraft stack.

## Setup sentence

"Two coding agents start from the same branch head. Both do useful work. In ordinary last-writer-wins automation, the later branch write can erase the fact that someone else advanced the branch. Lineage refuses to do that silently."

## Demo sequence

1. Open the Lineage Control Room.
2. Show the same base commit and two agent identities.
3. Explain that both agents started from the exact same immutable head.
4. Show Agent A's successful branch advance.
5. Show Agent B receiving `LINEAGE_STALE_REF`.
6. Show that Agent B's proposed commit still exists by immutable ID.
7. Inspect actor, message, rationale, parents, semantic changes and authority.
8. Explain that reconciliation is now an explicit decision instead of accidental overwrite.
9. Show Git export/mirror and explain that GitHub can remain connected during migration.
10. Close on the $500 founding pilot.

## Close

"We are not asking you to replace GitHub tomorrow. We are asking you to put one AI-heavy repository behind Lineage for a bounded pilot and see how much history your current workflow is throwing away."

## Pilot CTA

Lineage Founding Pilot: $500 one-time for the first 5 external design partners.

The buyer must explicitly authorize repository access and payment. Evercraft Payments is authoritative for paid state.
