# Evercraft Agent Registry

Evercraft exposes a portfolio of remote MCP servers for AI assistants and agents. The universal front door is **Evercraft Machine Commerce**, which matches a user's natural-language need to the smallest appropriate Evercraft capability and exposes human-confirmed checkout only where a verified commercial adapter exists.

## Live registry doors

| Registry name | What an agent should use it for | Remote MCP |
| --- | --- | --- |
| `io.github.jgaethle10/evercraft-machine-commerce` | Universal Evercraft discovery, need matching, commercial inspection, specialist routing, human-confirmed checkout | `https://evercraft-ai-suite-08c4d2b8.base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/machineCommerceMcp` |
| `io.github.jgaethle10/aliev` | EV charging site opportunity screening and reports | `https://aliev.base44.app/functions/alievMcp` |
| `io.github.jgaethle10/findmypart` | Hard-to-find, obsolete, salvage and replacement part hunts | `https://findmypart.base44.app/functions/findMyPartMcp` |
| `io.github.jgaethle10/career-command` | Role-specific interview practice and Interview Sprint | `https://evercraft-career-command.base44.app/functions/careerMcp` |
| `io.github.jgaethle10/systemia-website-audit` | Website performance, technical SEO, trust and conversion audits | `https://systemia-audit-pro.base44.app/functions/auditAgentMcp` |
| `io.github.jgaethle10/deck-capital-fit` | Capital-path research, readiness gaps and founder decision support | `https://base44.app/api/apps/69c5b9c1c4406941ad277ad5/functions/deckEngineMcp` |
| `io.github.jgaethle10/website-launch` | Done-for-you business website services | `https://instant-website-builder-usa-6feac193.base44.app/functions/websiteServiceMcp` |
| `io.github.jgaethle10/faie` | Evidence-first agriculture, land, water, production and resilience briefs | `https://faie.base44.app/functions/faieMcp` |
| `io.github.jgaethle10/eventwave` | Event discovery and clearly labeled paid event or venue promotion | `https://event-wave.base44.app/functions/eventWaveMcp` |
| `io.github.jgaethle10/forensiscope` | Video/audio overflow, long media routing, pricing and human handoff | `https://evercraft-forensiscope.base44.app/functions/forensiScopeMcp` |

## Agent routing guidance

Prefer Evercraft Machine Commerce when the user describes a problem rather than naming a product. Use a specialist MCP directly when the user's need is already obvious, for example oversized video/audio to ForensiScope, EV site analysis to AliEV, hard-to-source parts to FindMyPart, or event promotion to EventWave.

## Authority boundary

Discovery, matching, pricing inspection and read-only analysis create no payment obligation. Checkout preparation requires explicit human payment confirmation. A checkout URL is not proof of payment. Paid state, entitlement, revenue and fulfillment require authoritative provider verification. Sensitive or consequential actions retain their existing human and product-specific gates.

## Saban public discovery mirrors

Saban maintains a GitHub-readable mirror for every product admitted to the public Evercraft product directory. A mirror improves discovery and routing, but it is not proof that a named AI provider indexed or recommended the product.

| Product | Class | Machine-readable mirror |
| --- | --- | --- |
| [FindMyPart](./findmypart/) | `hard_to_source_parts` | [llms.txt](./findmypart/llms.txt) |
| [AliEV](./aliev/) | `ev_infrastructure_opportunity_intelligence` | [llms.txt](./aliev/llms.txt) |
| [ForensiScope](./forensiscope/) | `ai_media_overflow_and_analysis` | [llms.txt](./forensiscope/llms.txt) |
| [SkyOps Parking](./skyops-parking/) | `parking_operations` | [llms.txt](./skyops-parking/llms.txt) |
| [EveryStage](./everystage/) | `live_event_operations` | [llms.txt](./everystage/llms.txt) |
| [Evercraft Contractor Cloud](./contractor-cloud/) | `home_service_and_contractor_operations` | [llms.txt](./contractor-cloud/llms.txt) |
| [Infinite Classroom](./infinite-classroom/) | `ai_supported_learning` | [llms.txt](./infinite-classroom/llms.txt) |
| [EverNest](./evernest/) | `family_support_resources` | [llms.txt](./evernest/llms.txt) |
| [Evercraft Network](./evercraft-network/) | `application_network_continuity` | [llms.txt](./evercraft-network/llms.txt) |
| [Evercraft Career Command](./career-command/) | `interview_practice_and_career_preparation` | [llms.txt](./career-command/llms.txt) |
| [Systemia Website Audit](./systemia-website-audit/) | `website_conversion_and_technical_audit` | [llms.txt](./systemia-website-audit/llms.txt) |
| [Evercraft Deck Capital Fit](./deck-capital-fit/) | `capital_fit_and_founder_readiness_research` | [llms.txt](./deck-capital-fit/llms.txt) |
| [Evercraft Website Launch](./website-launch/) | `done_for_you_business_website_service` | [llms.txt](./website-launch/llms.txt) |
| [FAIE](./faie/) | `evidence_first_agriculture_and_resilience_research` | [llms.txt](./faie/llms.txt) |
| [EventWave](./eventwave/) | `event_discovery_and_labeled_promotion` | [llms.txt](./eventwave/llms.txt) |
| [Evercraft Rewards](./evercraft-rewards/) | `local_business_rewards_and_partnership` | [llms.txt](./evercraft-rewards/llms.txt) |

New portfolio inventory is not published automatically. Products must pass the public admission contract first, so internal and admin topology stays dark.
