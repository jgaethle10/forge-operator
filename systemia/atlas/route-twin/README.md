# RouteTwin | Systemia Atlas freight route rehearsal

**Status: source-coded prototype, NOT a verified deployed service.** Read-only, synthetic-only, no customer records, live data integrations, paid service, or dispatch authorization.

## Position and ownership

RouteTwin is a **freight route rehearsal module** under Systemia Atlas. It is not a new competing platform, not the existing Atlas freight-document exception intelligence itself, and not EarthWorks physical vehicle control. Systemia is the orchestration boundary; Evercraft Worlds / World Engine is the intended long-term 3D substrate. This v0 public-browser projection uses a small owned WebGL2 renderer to avoid coupling a prototype to production world-state authority.

## First runnable proof

- Cockpit: `public/apps/route-twin/index.html`
- Renderer, camera, playback and export: `public/apps/route-twin/app.mjs`
- Pure deterministic scenario model: `public/apps/route-twin/route-core.mjs`
- Regression tests: `tests/atlas-route-twin.test.mjs`

Run `python3 -m http.server 8766 -d public` from repository root; open `http://localhost:8766/apps/route-twin/` with WebGL2 support. Or run `node --test tests/atlas-route-twin.test.mjs` for deterministic scenario tests.

The interactive proof provides:

- Stylized, procedural WebGL2 terrain and corridor, orbit camera and truck-follow view
- Adjustable truck profile, local departure hour, sample scenario
- Timeline scrub and guided truck playback with arrow-key stepping
- Hypothetical timed snow, hypothetical crosswind and hypothetical pass-closure hard stop
- Four-leg readout and machine-readable JSON export with evidence/authority metadata

**Nothing on the path is a road centerline.** Stops, shape, distances, speeds, travel time and hazard scenarios are schematic test inputs, even where real city or pass names are used. No route is truck-legal or valid for operational navigation until a licensed, validated truck routing graph and source verification are connected. Truck dimensions are recorded but *not* checked against any bridge.

## Source truth architecture

Keep these four states separate everywhere:

1. **Observed**: official measured/recorded road events with immutable event ID, issuing source URL, first-seen/observed timestamp, fetched timestamp, expiry/freshness, spatial coverage and raw evidence receipt.
2. **Forecast**: model-derived upcoming weather/traffic with issue time, validity window, forecast grid/location, lead time and uncertainty. Do not call it observed.
3. **Hypothetical**: operator-created what-if scenario, visually obvious and never merged into real-world evidence.
4. **Unknown/stale**: missing coverage or expired observations. This is not 'no restriction'.

Future owned, server-side adapters (not shipped in v0):
- WSDOT Traveler Information API: mountain passes, closures, commercial-vehicle restrictions, alerts, camera snapshot metadata, bridge clearances and weather stations. WSDOT requires API access codes for some services. Never embed API keys in public JavaScript.
- National Weather Service API: point/grid hourly forecasts and official active alert endpoints, each with event times and spatial validity.
- Truck-legal route graph with a separately reviewed data/license/quality plan: no ordinary car route can be assumed legal for a specific truck.
- 3D geospatial surfaces and city geometry: licensed georeferenced data and confidence, not arbitrary illustrative meshes.

**Safety:** WSDOT expressly warns that clearance data is a guide, not a guarantee; the operator must independently verify obstructions, route restrictions, permits and actual maneuvers. A simulation cannot give operational clearance. Never treat a source availability error, stale feed, absent weight restrictions, or an unknown clearance as a safe route. Halt/hold if any high-consequence required input is missing. No auto-dispatch, reroute, carrier contact, permit filing, vehicle actuation or payment.

## Architecture after the demo

`Atlas authenticated shipment intent → vehicle/cargo restrictions → truck-legal route candidates → server-side WSDOT/NWS source adapters → evidence/time/location reconciliation → deterministic segment evaluator → World Engine geospatial projection → human dispatch review → read-only briefing receipt`

The current v0 only implements the **deterministic illustrative evaluator** and **local 3D projection**. Existing Atlas freight-document discovery metadata remains unchanged; no new capability claims or checkout are made there.

## Explicit release gates

- [ ] Validate this branch in browser/phone, confirm WebGL initialization, UI and scenario behaviors; attach screenshot, FPS and memory receipt.
- [ ] Run the included Node test suite in CI; inspect the result.
- [ ] Build and document route geometry licensing and truck-legal graph validation.
- [ ] Stand up a private, keyed WSDOT adapter and NWS adapter; store full provenance, timestamps, stale rules and known coverage limitations.
- [ ] Build source-to-segment spatial/temporal matching with deterministic tests for stale and contradictory signals.
- [ ] Connect the owned World Engine/Worlds renderer after runtime admission and access isolation.
- [ ] Threat model private load/driver data, source abuse and access controls; avoid mixing customer scope.
- [ ] Field-validate sample route with a qualified operator; get regulatory/insurance review before navigation claims.
- [ ] Independently verify public HTTPS reachability before offering the prototype to customers.
- [ ] Define a customer-priced, human-reviewed freight corridor study only after repeatable evidence and delivery capacity.

## Official data references for later integration

- WSDOT Traveler Information API: https://www.wsdot.wa.gov/traffic/api/
- WSDOT commercial vehicle restrictions: https://wsdot.wa.gov/travel/commercial-vehicles/route-commercial-vehicle-restrictions
- NWS API documentation: https://www.weather.gov/documentation/services-web-API

These references are *not connected* to v0 and are not endorsements.
