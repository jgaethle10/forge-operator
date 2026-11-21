# HIST-TECH-001 | Stage 6: Synchronized DC Energy Integration

**Status:** proposed analysis code and synthetic regression tests. No instrument measurements, calibration verification, hardware operation, Saban worker execution, or scientific discovery is claimed.

## Why this is needed
A single voltage and current reading, or voltage averaged separately from current, can misstate power when conditions change. Even modestly varying DC has correlated voltage/current fluctuations. To approximate total energy, `time-series-energy.mjs` multiplies **synchronized sample pairs** to form instantaneous input/output power and integrates that power over the observation window with the trapezoidal rule.

NIST has published sampling-based wattmeter work demonstrating that average electrical power can be determined by multiplying time-aligned voltage/current samples and integrating/averaging. Reference: [NIST Technical Note 1420](https://nvlpubs.nist.gov/nistpubs/Legacy/TN/nbstechnicalnote1420.pdf). We are **not** claiming equivalent metrology accuracy, bandwidth, instrument calibration, or certification.

## Mathematical scope
For each enumerated DC input source and the loaded DC output, with sample times `t_i` and pairwise simultaneous volt/current `V_i`, `I_i`, compute samplewise `P_i = V_i I_i`; then

`E ≈ Σ_i 0.5 × (P_i + P_{i+1}) × (t_{i+1} - t_i)`.

Total DC-source input is the sum of the independently enumerated source integrals, including every external adapter, auxiliary supply or battery energy actually delivered through the measured power-entry boundaries. Apparent energy ratio = delivered loaded-output energy / all enumerated input energy.

A separate user-specified **absolute power-error bound** for each sample is integrated as a conservative numerical interval. Its ratio brackets are not a standard uncertainty budget or statistical confidence interval; the bounds may omit entire uncertainty contributions or be self-declared. For reports requiring defensible uncertainty, follow [NIST TN 1297](https://www.nist.gov/pml/nist-technical-note-1297/nist-tn-1297-7-reporting-uncertainty) and independently review covariance, timebase and instrumentation.

## Key input rules
- `dataKind` is `synthetic` or `measured`. The function never independently authenticates either.
- `timebase` **must** be `synchronized_steady_dc_samples`; this is **not** an AC/RF analyzer. Slow changes in DC are supported if sampling is adequate.
- `inputSources` enumerates all DC power-entry streams; `loadedOutput` is one separately named loaded DC-output stream. Each has 3–10,000 time-aligned sample records.
- At every sample: `tSeconds`, `voltageVolts`, `currentAmps`, `absolutePowerBoundWatts` are finite nonnegative values. `tSeconds` starts at zero, strictly increases, and every gap is at most `maxGapSeconds`.
- Every channel shares **exactly identical timestamps**; no quiet interpolation or unsynchronized comparisons. Real instruments must demonstrate synchronization externally.
- `sourceInventoryAttested: true`, `synchronizedSamplingAttested: true`, and `sourceInventoryNote` must be supplied. For `measured`, `rawSourceReference` and `operator` are required. These are metadata attestations, not independent proof.
- Source and loaded-output IDs must be distinct and each source counted exactly once.
- Voltage/current signs are restricted to nonnegative unidirectional DC. Batteries charging/discharging, regenerative current, signed voltage/current, switching waveforms and AC require a separately reviewed energy model and acquisition protocol.
- The model always returns `publicationAllowed: false`, `scientificClaimAuthorized: false`, and independent-authentication flags all false, even if numerical checks pass.

## Illustrative software-only example
In a **synthetic** three-sample, two-second session, an input source holds 5 V × 1 A = 5 W and integrates to 10 J. A varying loaded output samples (1 V × 3 A), (2 V × 2 A), (3 V × 1 A), for 3 W, 4 W, 3 W respectively. The trapezoidal integral is **7 J**, an apparent 70% ratio. Multiplying separately averaged V and I would incorrectly yield 8 J (80%) for this contrived example. None of these values came from an instrument.

## Evidence chain required for real observations
1. Independently select and approve **rated low-voltage** equipment, real acquisition bandwidth, current-limiting, safety controls and DC-only power measurement points.
2. Capture original time-aligned voltage and current for *each* DC input and load, including all auxiliary sources and converter/controller overhead. Document physical timing skew, timebase, digitizer bandwidth and error budget.
3. Match a trial to raw bytes and checksums through [EVIDENCE_INTAKE.md](EVIDENCE_INTAKE.md), including instrument calibration documentation and safety review. Do not assume the earlier steady-state `bench-evaluator.mjs` validates this time-series schema; the schemas are distinct.
4. Independently check for aliasing, unobserved fast switching/ripple, sample timing errors, start/end transients and changes in stored magnetic/electrostatic/battery energy, all of which can invalidate the simple trapezoidal estimate.
5. Independent physics/metrology review must validate the signal-processing choice and true experimental completeness. The new code supplies no GUM-style combined standard uncertainty, accredited calibration, or scientific authorization.

## Commands
```bash
node --check systemia/research/historical-tech/time-series-energy.mjs
node --test systemia/research/historical-tech/*.test.mjs
```

**Exit gate:** GitHub CI demonstrating software regressions is a development milestone. The next milestone is *a reviewed acquisition method* and approved safe physical trial, not a headline about energy generation.
