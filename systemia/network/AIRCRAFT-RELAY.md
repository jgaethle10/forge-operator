# Evercraft Network Aircraft Relay v1

Aircraft Relay extends Evercraft Network from currently available airborne relays into predictable, temporary contact opportunities created by participating civilian aircraft.

The aircraft is not treated as flight-control infrastructure. Evercraft Network never needs access to flight-critical avionics or navigation control.

## Node class

A participating aircraft may expose the placement class:

    aircraft_relay
    transient
    high_mobility

Participation is explicit. The planner requires the aircraft node to be authorized, opted in, in a safe operating state, isolated from avionics, and configured with no flight-control access.

## Two modes

### Live relay

A live relay requires two verified contact windows that overlap in time:

    ground A -> aircraft -> ground B

Predicted or scheduled contacts cannot satisfy a live route. This prevents a flight schedule from being mistaken for working connectivity.

### Data ferry

A data ferry uses store-and-forward:

    ground A -> aircraft
    aircraft carries authenticated data
    aircraft -> ground B

The pickup and drop windows do not need to overlap. This makes high-mobility aircraft useful across disconnected regions without requiring a continuous end-to-end link.

Future operator-approved contact windows may be used for planning when the mission explicitly permits predicted contacts. The result is FORECAST_PLAN_READY, never ROUTE_READY, until the contacts are actually verified.

## Capacity accounting

Each contact window carries bandwidth, duration, link-efficiency, authorization, evidence state, and an evidence reference.

The planner calculates transferable bytes and rejects plans that cannot carry the mission payload. Data-ferry plans may also specify a delivery deadline.

This turns aircraft contact into time-bounded network capacity rather than a vague availability claim.

## Systemia and Saban

Aircraft Relay is compatible with the NodeSeed placement fabric already in Evercraft Network.

A participating onboard compute environment can expose an attested aircraft_relay label through NodeSeed. Saban can then require or forbid that placement class using its existing signed placement-label contract.

A future Systemia decision can therefore choose among:

    fixed terrestrial route
    ground mobile relay
    drone / Air Relay
    participating aircraft live relay
    participating aircraft data ferry
    delayed local queue

without changing the mission authority model.

## Boundaries

Aircraft Relay v1 does not:

- control or influence aircraft navigation;
- connect to flight-critical avionics;
- authorize spectrum use;
- infer operator consent from public flight tracking;
- treat an aircraft being physically overhead as permission to use it;
- turn a predicted contact into a verified route;
- certify real-world airborne radio performance.

Public or third-party flight data may eventually help estimate opportunity, but actual participation, radio capability, and network authorization require separate evidence and consent.

## Proof

Run:

    npm run proof:aircraft-relay

The proof verifies forecast data-ferry planning, verified live-relay overlap, payload capacity, deadline handling, explicit aircraft participation, avionics isolation, and the boundary between predicted and verified connectivity.
