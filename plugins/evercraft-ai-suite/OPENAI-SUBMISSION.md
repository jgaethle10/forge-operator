# OpenAI plugin submission checklist

Evercraft AI Suite is packaged in `plugins/evercraft-ai-suite/`.

## Engineering-ready

- Remote public HTTPS MCP exists.
- Official MCP Registry publication and remote MCP canaries exist elsewhere in this repository.
- Portable plugin manifest exists.
- OpenAI/Codex compatibility manifest exists.
- MCP configuration exists.
- Pain-first routing skill exists.
- Payment and privacy boundaries are explicit.

## Human/account gates still required before public ChatGPT/Codex directory publication

1. Use the OpenAI organization that will publish as Evercraft.
2. Confirm the organization has plugin submission / Apps Management permission.
3. Complete the publisher identity verification required by the submission portal.
4. Provide final public website, support, privacy-policy, and terms URLs that Evercraft approves.
5. Create a **With MCP** submission using the live Evercraft Machine Commerce MCP endpoint.
6. Use the listing name **Evercraft AI Suite** unless Evercraft intentionally chooses another public name.
7. Submit for review.
8. After approval, explicitly publish the approved plugin.
9. Verify directory search by exact name and then run brand-blind CHUM/Nexus discovery probes.

Do not claim public OpenAI plugin availability before step 8 has a receipt.
