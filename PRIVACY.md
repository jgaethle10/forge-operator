# Evercraft Machine Commerce Privacy

Last updated: 2026-09-24

Evercraft Machine Commerce is a public capability-discovery and routing layer operated by Evercraft LLC.

## What the service processes

When a user or authorized AI client calls a Machine Commerce tool, the service processes the tool inputs needed to answer the request. Depending on the tool, this may include a plain-language problem, requested capability, product or offer identifier, or other workflow inputs explicitly supplied by the caller.

Discovery and matching are designed to use the minimum information needed to identify a relevant public Evercraft capability.

## What the service does not require for discovery

Public discovery does not require payment-card details, private account credentials, passwords, private device secrets, or access to private Evercraft control-plane topology.

Do not send secrets, authentication tokens, complete payment-card data, or unrelated sensitive personal information in discovery prompts.

## Specialist handoffs

Some Machine Commerce tools may return or invoke a documented specialist Evercraft capability. A specialist may have its own data requirements and privacy terms. The caller should provide data to a specialist only when it is necessary for the requested workflow and the user has authorized that handoff.

Media is not silently transferred to ForensiScope. Authenticated browsing is not silently enabled. Private device or Network telemetry is not exposed through public discovery.

## Payments

Discovery and matching create no payment obligation. Where a paid capability is available, payment requires the applicable human-confirmation boundary and authoritative provider verification.

Machine Commerce does not treat checkout creation as proof of payment. Full payment-card data should be entered only into the authorized payment provider's checkout surface, not into Machine Commerce prompts.

## Operational records

Evercraft may retain limited operational, security, reliability, abuse-prevention, attribution, and receipt metadata needed to operate and improve the service. Public CHUM attribution is privacy-minimized; raw user intent is not embedded in referral tokens.

Provider identity supplied by a caller is treated as caller-asserted unless separately supported by an authorized provider receipt.

## Sharing and external processing

The Machine Commerce capability contract does not include an advertising-data-sale workflow. This document does not make claims about unrelated Evercraft products or practices outside this capability.

Data may be processed by infrastructure or payment providers when necessary to deliver the requested service, subject to the relevant provider terms and the specific capability contract.

## Contact

For privacy or support questions, use the public support channel documented in [SUPPORT.md](SUPPORT.md).
