# Compute Fabric Verification

Verified on 2026-09-24 against the recovered `evercraft.saban.network-seed.v1` executable proof.

## 10,000 logical-agent retest

- status: PASS
- logical agents requested: 10,000
- NodeSeed processes: 2
- dynamic capacity discovery: PASS
- prior pre-enrollment required: false
- bounded lease negotiation: PASS
- independent Linux NodeSeed processes: PASS
- simulated NodeSeed/path loss: PASS
- checkpoint/rebind after path loss: PASS
- logical agents rebound after NodeSeed A loss: 5,000
- arbitrary shell execution exposed: false
- receipt chain valid: true
- receipt chain head: `38fd4197f733421fc06758bae49cfc48ccdd617fca89af70f94e45330e3617fe`
- summary SHA-256: `67848d3857651a742979493be5b34844f2d1088c7e295d53afd8b28da177cd86`
- receipts SHA-256: `9acfcfd85ea06b193385c084ea6dd352cb1993981a140086bd974d8bd0168deb`

## What this proves

The proof demonstrates that Saban's logical worker count is independent from physical node count. Capacity can be discovered and leased dynamically, one NodeSeed can disappear after useful work, and checkpointed logical workers can resume against surviving authorized capacity.

## What this does not prove

This is not evidence of 10,000 simultaneous VMs or 10,000 physical machines. The proof uses two Linux NodeSeed processes and 10,000 logical workers.

It does not yet prove:
- production remote-host isolation
- a production secret store
- internet-scale discovery
- production residual-capacity subdivision
- production billing
- public API exposure
- arbitrary shell access, which remains intentionally absent

## Next integration gate

Wire NodeSeed offers into the Systemia Compute capacity pipeline:

`NodeSeed/Network -> ComputeSharePolicy -> ComputeCapacityOffer -> ComputeCapacityRequest -> MatchReceipt -> Lease -> SabanWorkCell -> Checkpoint/Rebind`

A host may advertise `linux_runtime` when proven, but `ephemeral_workspace` must be independently attested before Saban coding cells may execute.


## Provider-neutral policy-core tests

The Base44-specific scheduler logic was extracted into `lib/compute-fabric.mjs` and validated independently with Node.

Result: **PASS**

Covered checks:
- safe CPU/RAM/storage headroom calculation
- memory ceiling precedence over nominal max allocation
- NodeSeed workspace attestation gate
- `linux_runtime` does not automatically imply `ephemeral_workspace`
- tenant-isolation contract
- outbound-only network policy
- no-peer-discovery requirement
- internet-egress denial
- zero-spend default
- conservative capacity-offer occupancy / overbooking guard
- preferred backing-class selection
- 10,000 logical workers -> 1,000 ten-agent work cells
- logical ceiling rejects 10,001 workers

Test output:
```json
{
  "status": "PASS",
  "tests": 13,
  "logical_10k_cell_count": 1000,
  "parallel_cells_admitted": 250,
  "overbooking_guard": "PASS",
  "workspace_attestation_gate": "PASS",
  "network_policy_gate": "PASS"
}
```
