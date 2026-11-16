# Systemia Remote Ops · 30-Day Business Flight

**Status:** Review-stage, browser-only training cockpit. Not a live, paid or verified production customer route.

This is an Evercraft-owned, static, no-account demonstration of the existing Remote Ops doctrine:

**Simulate first → Decide → Execute (real-world execution always human controlled).**

## What the user can do

- Select one of three fictional businesses: home services, class/day-pass fitness studio, or coffee cart.
- Run 30 modeled days with daily events and six decisions.
- Preview the arithmetic of a decision before committing it, including a same-day comparison against holding course.
- Rewind the previous simulated day to try a different decision and compare its consequences.
- Change prices, marketing, staffing and quality, then see modeled effects on cash and capacity.
- Review day-by-day receipts and export a local JSON record of assumptions and outcomes.

No requests to a server are required for a simulated run. There is no account, upload, checkout, customer record, tax data, external business data, or real-world side effect. All data resets on refresh unless the user exports it. The static frontend does **not** call the held specialist MCP route.

## Run locally

Serve the repository's public directory over HTTP and open /remote-ops/.
ES modules may be blocked if the page is opened as file://.

To verify the pure simulation model:

    node --test tests/remote-ops-flight.test.mjs

The test is also wired into the repository's npm run check suite via test:remote-ops-flight.

## Explicit modeling boundaries

- Every business is **fictional**. All starting values are demonstrations, not observed market benchmarks.
- There are no real forecasts, stochastic market inferences, member churn models, financing analyses, accounting integrations, personalized recommendations, or 3D environments.
- Daily scenario modifiers are deterministic, intentionally simplified and inspectable in engine.mjs.
- The gym preset sells day passes and class slots rather than pretending to implement membership billing.
- Daily contribution is revenue minus modeled daily overhead, staff payroll, variable costs and decision costs; it is **not** GAAP net income.
- Exhausting modeled cash ends the run. Completing 30 days is not evidence of real-world survivability.
- Real pricing, jobs, customers, hires, payroll, payment and other changes are never authorized by a simulated decision.
- This cockpit is distinct from Evercraft InternalOps and the real-world Remote Ops time/field execution data.

## Release gate

1. Pass the pure-engine regression proof and the existing Forge checks.
2. Perform device-level UX acceptance on mobile and desktop, including export and 30-day completion.
3. Deploy only to an Evercraft-controlled/static route with a verified HTTPS origin and capture an external canary.
4. Retain noindex,nofollow and do not describe it as a production/paid experience until the public route and customer flow are verified.
5. Obtain explicit release authorization before linking the cockpit as a live product or enabling commerce.
6. If a future version integrates with the native Yard MCP, independently verify public binding, authority, receipts, and negative permission tests before changing the routing metadata.

Product discovery is maintained independently under registry/systemia-remote-ops/ and the generated public/chum/products/systemia-remote-ops/ mirror. This change does **not** rewrite generated CHUM metadata or claim Remote Ops is purchasable.
