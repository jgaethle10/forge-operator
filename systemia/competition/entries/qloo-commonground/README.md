# CommonGround

**CommonGround** is a group-choice agent built for the 2026 Qloo Agentic Hackathon.

Most recommendation systems optimize for one profile. Real life usually has more than one human in the room. CommonGround asks each person for a few cultural anchors, calls Qloo's Taste AI separately for each profile, then computes a consensus across the group. The result is a plan for a date night, family outing, trip, movie night, or shopping decision that is grounded in cultural affinity instead of whoever talks the loudest.

## Why Qloo is essential

CommonGround does not ask an LLM to guess what people with different tastes might agree on. Qloo is the recommendation substrate. For each category and each profile, the agent sends the person's cultural anchors to the Qloo Insights API and receives ranked, explainable recommendations. CommonGround then performs a second agentic step: it merges those independent taste rankings into a group consensus that rewards both high affinity and cross-profile coverage.

Without Qloo, the system loses the taste graph that makes cross-domain agreement possible.

## Agent loop

1. Normalize 2-4 anonymous taste profiles.
2. Choose up to three domains from the group's objective.
3. Query Qloo independently for each profile and domain.
4. Preserve provider ranking, affinity and explainability.
5. Compute a coverage-aware consensus score across profiles.
6. Return the highest-overlap choices and an auditable agent trace.

Profile labels are never sent to Qloo. The service does not persist raw interests. The Qloo API key remains server-side.

## Run

Requires Node.js 22+ and a Qloo hackathon API key.

```bash
export QLOO_API_KEY="..."
npm test
npm start
```

Open http://localhost:8080.

Optional:

```bash
export QLOO_API_BASE_URL="https://hackathon.api.qloo.com/v2"
export PORT=8080
```

## Docker

```bash
docker build -t commonground .
docker run --rm -p 8080:8080 -e QLOO_API_KEY commonground
```

## API

### POST /api/commonground

```json
{
  "profiles": [
    {"label":"Person 1","interests":["Studio Ghibli","Brian Eno"]},
    {"label":"Person 2","interests":["Wes Anderson","Tyler, the Creator"]}
  ],
  "objective":"Plan a date night everyone actually likes",
  "location":"Seattle, Washington",
  "categories":["place","movie","artist"],
  "price_level_max":3
}
```

Supported categories: `place`, `destination`, `movie`, `tv`, `artist`, `brand`, `book`, `videogame`.

## Evidence boundaries

- Provider-grounded means a successful Qloo API response was received.
- CommonGround never claims a reservation, purchase or payment.
- Missing Qloo credentials fail closed.
- The demo does not expose the Qloo key to the browser.
- Exact provider results are not fabricated when Qloo is unavailable.

## Competition packaging

This directory is intentionally self-contained. It can be extracted into a dedicated public GitHub repository with this LICENSE at repository root, satisfying the hackathon's open-source packaging requirement without relicensing the wider Evercraft monorepo.
