# Evercraft Network Air Relay v1

Air Relay extends Evercraft Network so an authorized civilian drone or other airborne platform can participate as a temporary network and compute relay without becoming a separate network architecture.

The core rule stays the same: the network contract is not the radio and it is not the aircraft.

Evercraft Network owns identity, authorization, capability evidence, authenticated envelopes, store-and-forward, checkpointing, receipts, reconciliation, and workload continuity. An airborne platform is another temporary node carrying one or more verified transport adapters.

## Civilian scope

Air Relay v1 admits only disaster recovery, emergency communications, environmental monitoring, infrastructure inspection, agriculture, rural connectivity, search and rescue, and temporary event connectivity.

The planner rejects combat, weapons, targeting, strike, munition, jamming, interception, evasion, person-tracking, and mass-surveillance intent. This is an Evercraft product boundary, not a claim that networking technology can never be dual-use.

## What v1 actually does

The air-relay-planner module consumes authorized nodes, verified link evidence, flight-authorization and safe-operating state, bandwidth and latency constraints, offline requirements, endurance and energy hints, and modeled infrastructure that a temporary relay could avoid.

It returns a route only when every participating node and link meets evidence and authorization gates.

It does not fly a drone, generate navigation commands, bypass aviation rules, operate radios without authorization, or infer that planned hardware exists.

## Infrastructure avoidance

The initial ecological and commercial metric is modeled physical infrastructure avoided while meeting the mission connectivity requirements.

The receipt can carry modeled trench meters avoided, temporary towers avoided, relay energy per hour, relay endurance, bottleneck bandwidth, and path latency. These values remain modeled until field measurements support them.

The target is not to declare fiber obsolete. Fiber remains an excellent backbone when its capacity and permanence justify installation. Air Relay exists to reduce unnecessary fixed construction where a temporary or adaptive path can meet the requirement.

## Saban and NodeSeed

An airborne relay may expose ordinary Evercraft NodeSeed capacity when the platform deliberately authorizes it.

The intended path is:

Systemia mission -> Network route -> authorized Air Relay -> NodeSeed lease -> Saban workload -> checkpoint -> handoff or rebind -> receipt

A platform may relay packets only, provide bounded edge compute, cache delayed traffic, or disappear and allow Saban to rebind work elsewhere.

## Truth boundary

Current repository proofs establish software policy and route-selection behavior only. They do not establish a field-tested drone radio, Wi-Fi Direct, BLE mesh performance, private-LTE airborne behavior, licensed-radio performance, autonomous flight, aviation approval, real battery endurance, or real-world ecological savings.

Those require physical field receipts before Evercraft may call them verified.

## Proof

Run npm run proof:air-relay.

The proof checks civilian admission, forbidden-intent rejection, explicit aircraft authorization, rejection of planned or unverified links, modeled infrastructure labeling, and the separation between network routing and flight control.
