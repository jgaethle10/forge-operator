# CHRONOS-001 — Controlled Temporal Displacement

CHRONOS is an evidence-gated Systemia research lane for temporal displacement, closed-timelike-curve models, negative-energy constraints, and operational tests of retrocausal signaling.

It does **not** assume that backward time travel is physically realizable.

## Claim classes

Every CHRONOS result must carry one of these meanings:

- `observed` — directly measured physical phenomenon.
- `experimentally_simulated` — laboratory or processor realization of a mathematical model/analog.
- `theoretically_derived` — consequence of an explicit physical/mathematical model.
- `model_derived` — number depends materially on a chosen geometry/model.
- `inferred` — interpretation supported by evidence but not directly observed.
- `speculative` — hypothesis without adequate experimental support.

Simulation is never silently upgraded to realization.

## Current kernel

`chronos.mjs` currently provides:

1. **Relativistic proper-time baseline**
   - Lorentz factor / target clock ratio.
   - Velocity required for that idealized ratio.
   - Ideal kinetic energy per kilogram.
   - Explicit warning that this is not a spacecraft energy budget.

2. **Morris-Thorne local throat stress-energy benchmark**
   - Uses
     `epsilon(r) = (c^4 / 8 pi G) b'(r) / r^2`.
   - This is a local model-dependent energy density, not a total exotic-matter requirement.

3. **Ideal Casimir benchmark**
   - Uses
     `epsilon_C = -pi^2 hbar c / (720 a^4)`.
   - Flat-space, infinite, perfectly conducting plates only.

4. **Negative-energy scale comparison**
   - Compares magnitudes without claiming engineering equivalence.
   - Returns the ideal Casimir plate separation that would match a selected local wormhole energy-density magnitude if the flat-space formula were extrapolated.

5. **Postselection causality control**
   - Demonstrates an exact toy case where `I(X;Y)=0` in the full earlier record, but `I(X;Y | S=1)=1 bit` after later postselection.
   - This is the canonical control for avoiding the false inference “postselected future correlation = usable message from the future.”

## First numerical benchmark

For a deliberately simple Morris-Thorne shape choice with:

- throat radius `r0 = 1 m`
- `b'(r0) = -1`

the local model-derived throat energy density is approximately:

`-4.82e42 J/m^3`.

For ideal parallel plates separated by `1 nm`, the Casimir vacuum-energy density magnitude is approximately:

`4.33e8 J/m^3`.

The raw magnitude gap is therefore approximately:

`1.11e34`.

If the ideal flat-space Casimir formula is naively inverted only as a dimensional benchmark, matching that local magnitude would require a separation of roughly:

`3.08e-18 m`.

**This number is not an engineering prescription.** At that scale the ideal-conductor, flat-space plate model is not a credible device model, and matching a scalar energy-density magnitude does not reproduce the required wormhole stress tensor or evade quantum energy inequalities.

## Retrocausal engineering gate

The primary operational target is not a philosophical interpretation of time symmetry.

For an earlier record `X`, a later independently generated choice `Y`, and a later success/postselection flag `S`:

- postselection can allow `I(X;Y | S=1) > 0`;
- a usable backwards-signaling claim requires information about `Y` to exist in the **unconditioned record available before Y is generated**, with ordinary channels, shared randomness, trial dropping, deterministic schedules, clock artifacts, and leakage excluded.

Any effect that disappears when all preregistered trials are restored fails this gate.

## T1 PCTC reproduction

`pctc-simulator.mjs` now reproduces the ideal four-qubit laboratory protocol in Huang et al. (2026) directly from Fig. 4 and Eqs. 11–13.

The simulator explicitly models the chronology-respecting laboratory sequence:

1. initialize H as a two-qubit maximally mixed state and E,E' as a Bell pair;
2. apply the three-qubit decoder `U†`;
3. record Bob's tomography outcome before the later input state exists;
4. reset that wire and freely prepare Alice's later state;
5. apply the three-qubit scrambler `U`;
6. Bell-project E,E' and postselect the matching outcome;
7. reconstruct Bob's earlier density matrix from the surviving branches.

The exact ideal benchmarks reproduce the paper:

- strong quantum scrambler `Uq`: `P=0.25`, `F=1` for all six Pauli-axis input states;
- classical-only scrambler `Uc`: `P=0.5`; `F=1` for z± and `F=0.5` for x±/y±;
- the earlier **unconditioned** Bob record has Bloch vector `(0,0,0)` for both scramblers.

That final point is the causal control: the apparent future-state recovery exists only after the later Bell result is used to select earlier records. Before that postselection, Bob's earlier record is maximally mixed and contains no usable information about Alice's later freely prepared state.

Run:

```bash
node systemia/research/chronos/pctc-simulator.proof.mjs
```

## Published hardware / finite-shot audit

`pctc-hardware-audit.mjs` now captures the published Table I results, the paper's shot counts, and the Appendix C calibration snapshots for Quantinuum H1-1 and IBM `ibm_torino`.

The paper reports **4000 shots per tomography measurement on H1-1** and **40,000 shots per tomography measurement on ibm_torino**.

A deliberately narrow binomial audit asks only one question: *could the observed success-probability shift plausibly be sampling fluctuation around the ideal value, if all other hardware effects were absent?*

Results:

- **H1-1, Uq:** all six reported success probabilities remain inside a simple 95% shot-noise-only envelope around ideal `P=0.25`; the largest shift is about `1.17 sigma`.
- **ibm_torino, Uq:** five of six reported states fall outside that same shot-only envelope, with the largest shift about `5.50 sigma`.
- **ibm_torino, Uc:** all six states are far from the ideal `P=0.5` shot-only envelope, around `21.6–23.8 sigma`.

This does **not** indicate anomalous causality. It indicates that finite-shot noise alone is insufficient to explain the IBM deviations, so hardware/compilation/readout/decoherence/systematic effects must be included before comparing experiment with the ideal circuit.

The source ledger also preserves the reported calibration snapshots:

- H1-1: readout error `2.5e-3`, single-qubit gate error `2.1e-5`, two-qubit gate error `8.8e-4`, calibration date 2024-04-10.
- ibm_torino: mean readout error across the four used qubits `~1.775e-2`, average CZ error `1.62e-3`, calibration date 2024-09-26.

Those calibration numbers are **inputs**, not yet a faithful noise channel.

Run:

```bash
node systemia/research/chronos/pctc-hardware-audit.proof.mjs
```

## Primary literature anchors

- Morris, Thorne & Yurtsever (1988), *Wormholes, Time Machines, and the Weak Energy Condition*, Phys. Rev. Lett. 61, 1446. DOI: 10.1103/PhysRevLett.61.1446
- Ford & Roman (1995), *Averaged energy conditions and quantum inequalities*, Phys. Rev. D 51, 4277. DOI: 10.1103/PhysRevD.51.4277
- Hawking (1992), *Chronology protection conjecture*, Phys. Rev. D 46, 603. DOI: 10.1103/PhysRevD.46.603
- Kontou (2024), *Wormhole Restrictions from Quantum Energy Inequalities*, Universe 10, 291. DOI: 10.3390/universe10070291
- Huang et al. (2026), *Experimental simulation of postselected closed timelike curves for decoding scrambled quantum information*, Phys. Rev. Research 8, 023084. DOI: 10.1103/tm83-sxpm
- Ji, Lloyd & Wilde (2026), *Retrocausal Capacity of a Quantum Channel: Communicating through Noisy Closed Timelike Curves*, Phys. Rev. Lett. 136, 230801. DOI: 10.1103/znyd-npk5

## Run the proof

```bash
node systemia/research/chronos/chronos.proof.mjs
```

The proof checks the current relativistic benchmarks, the 1 m throat / 1 nm Casimir scale comparison, and the postselection discriminant.

## Next gates

1. Add a source-provenance ledger for every formula and result.
2. Extend the PCTC simulator with finite-shot sampling and paper-calibrated noise so ideal predictions can be compared with the published Quantinuum and IBM results.
3. Add a preregistered **no-postselection** analysis that treats all trials as the primary endpoint.
4. Replace the single wormhole shape benchmark with a family of parameterized geometries.
5. Add QEI assumption tracking before any negative-energy pathway may advance.
6. Require independent red-team replication before any claim can move above simulation/model status.
