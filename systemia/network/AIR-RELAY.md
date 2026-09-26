# Evercraft Network Air Relay v2

Air Relay extends Evercraft Network so an authorized civilian drone or other airborne platform can participate as a temporary network and compute relay without becoming a separate network architecture.

The core rule stays the same: the network contract is not the radio and it is not the aircraft.

Evercraft Network owns identity, authorization, capability evidence, authenticated envelopes, store-and-forward, checkpointing, receipts, reconciliation, and workload continuity. An airborne platform is another temporary node carrying one or more verified transport adapters.

## Civilian scope

Air Relay admits only disaster recovery, emergency communications, environmental monitoring, infrastructure inspection, agriculture, rural connectivity, search and rescue, and temporary event connectivity.

The planner rejects combat, weapons, targeting, strike, munition, jamming, interception, evasion, person-tracking, and mass-surveillance intent. This is an Evercraft product boundary, not a claim that networking technology can never be dual-use.

## What the software does

The air-relay-planner consumes authorized nodes, verified link evidence, flight-authorization and safe-operating state, bandwidth and latency constraints, offline requirements, endurance and energy hints, and an optional infrastructure counterfactual.

It returns a route only when every participating node and link meets evidence and authorization gates.

It does not fly a drone, generate navigation commands, bypass aviation rules, operate radios without authorization, or infer that planned hardware exists.

## Route objectives

Air Relay does not use a blended or invented ecological score.

The default objective is balanced. It ranks eligible routes using concrete network properties in deterministic order: latency, bottleneck bandwidth, hop count, then airborne energy use.

A mission may explicitly choose latency, energy, or infrastructure_avoidance instead. The selected objective and the exact ranking order are emitted in the plan receipt.

Infrastructure avoidance is never silently mixed into normal routing.

## Infrastructure counterfactual

A mission may supply modeled or source-backed information about physical infrastructure that a temporary relay could potentially avoid, such as trench length or temporary towers.

The output calls these values potential avoided infrastructure and labels them modeled_counterfactual. Evidence references and the evidence state of the underlying counterfactual travel with the receipt.

This is not a calculation of ecological benefit, carbon savings, habitat impact, lifecycle impact, or avoided environmental damage. Those require separate evidence and methodology.

The target is not to declare fiber obsolete. Fiber remains an excellent backbone when its capacity, durability, economics, and permanence justify installation. Air Relay exists to make fixed construction optional where a verified temporary or adaptive path can actually meet the requirement.

## Saban and NodeSeed

An airborne relay may expose ordinary Evercraft NodeSeed capacity when the platform deliberately authorizes it.

NodeSeed placement labels can identify a node as air_relay. Placement-sensitive Saban scheduling requires a signed device attestation and rejects the node when signed labels do not match the capacity advertisement. A placement label does not self-certify flight safety or field readiness.

The intended path is:

Systemia mission -> Network route -> authorized Air Relay -> attested NodeSeed -> Saban lease -> bounded workload -> checkpoint -> handoff or rebind -> receipt

A platform may relay packets only, provide bounded edge compute, cache delayed traffic, or disappear and allow Saban to rebind work elsewhere.

## Truth boundary

Repository proofs establish software admission, route selection, identity attestation, and placement-policy behavior. They do not establish a field-tested drone radio, Wi-Fi Direct, BLE mesh performance, private-LTE airborne behavior, licensed-radio performance, autonomous flight, aviation approval, real battery endurance, or real-world ecological savings.

Those require physical field receipts before Evercraft may call them verified.

## Proof

Run npm run proof:air-relay and npm run proof:nodeseed-placement.

The proofs check civilian admission, forbidden-intent rejection, explicit aircraft authorization, rejection of planned or unverified links, deterministic route objectives, counterfactual infrastructure labeling, signed NodeSeed placement claims, and the separation between network routing and flight control.
