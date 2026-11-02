# BENCH_PROTOCOL | HIST-TECH-001
**Stage:** design only. No experiment was conducted or authorized by this document. The first proposed demonstration is low-voltage, current-limited, enclosed inductive wireless power, NOT a Tesla coil or Wardenclyffe reproduction.

## Question
How does DC-source-to-loaded-DC-receiver efficiency of a small inductive power demonstrator change with coil separation and alignment?

This is a repeatability benchmark for standard electromagnetic induction. It does not test "free energy" or Tesla's claimed global transmission.

## Prerequisites, permissions, safety
- Seek explicit owner authorization for the exact hardware, location, competent supervisor, instrument list, and current-limited supply before energizing anything.
- Prefer a commercially made educational inductive-transfer module with documented operating limits, insulated terminals and a low-voltage DC supply. No connection to mains beyond a certified external supply.
- Perform a documented risk assessment, identify a clear kill switch, avoid exposed conductors, inspect overheating and interference risks, and remove metallic objects from the coupling region. Foreign metals can heat due to induced eddy currents, according to the Wireless Power Consortium specification: https://www.wirelesspowerconsortium.com/media/cd4ljryt/qi-v13-introduction.pdf
- No homemade high-voltage coils, megavolt circuits, pressurized gas, RF amplifiers, lasers, drones, trials involving people or medical equipment.
- Stop if parts become abnormally hot, electromagnetic interference is observed, or equipment limits are exceeded.

## Minimal equipment proposal (NOT purchased)
- Rated, enclosed low-voltage inductive-transfer teaching system with accessible **DC source** and **DC loaded-receiver** test points
- Two appropriate calibrated DC power meters (or voltage/current measurement channels with documented accuracy); current-limited, manufacturer-approved DC input supply
- Manufacturer-approved load, nonconductive mounting board, nonmetallic spacer and measuring scale
- Instrument/model/serial/calibration metadata, original meter logs and setup photographs; no physical build until approval

## Measurement controls
1. Document device, rated operating range, ambient conditions and all actual energy inputs. Batteries, adapters, auxiliary controls and instrumentation power **must not** be silently omitted.
2. Measure **DC voltage and current simultaneously** at the whole transmitter-system power-entry point, and loaded **DC voltage and current** after the receiving rectifier; only under a steady-state, stable operating condition. The analyzer below uses DC V×I, and MUST NOT be used for alternating or RF quantities where waveform and power factor matter.
3. For each separation/alignment setting, run at least **three independently started aligned trials**, plus one misaligned and one receiver-absent negative control; capture actual spacing and angle. This minimum is a sanity gate, not a defensible statistical power calculation.
4. Record voltage/current measurement uncertainty bounds as absolute watts and identify instrument traceability and raw files. The simple intervals are conservative bounds, **not** NIST-style statistical confidence intervals and not a substitute for a full measurement-uncertainty budget.
5. Keep baseline source settings and loads constant between controls where technically feasible. Repeat if conditions change.
6. Compute loaded-output power / total-system input power, and tabulate losses. If reading exceeds 100%, investigate timing mismatch, omitted inputs, electrical measurement mode, calibration, transient stored energy and data transcription before drawing any conclusion.
7. No claim of peer-reviewed performance, medical efficacy or unusual physics without independent replication and full methods.

## Data shape and evaluator
Use `synthetic-example.json` only as a software fixture and NEVER as laboratory evidence.

```bash
node --test systemia/research/historical-tech/*.test.mjs
node systemia/research/historical-tech/bench-evaluator.mjs systemia/research/historical-tech/synthetic-example.json
```

The evaluator refuses AC/RF input assumptions, requires uncertainty fields, and demands traceability and a recorded safety review for any sample labeled `measured`. A text flag cannot itself confirm real calibration or safety approval. The returned `experimentalDesignComplete` is an automated minimum-control check, **not** certification that the experiment was completed, safe, correct or validated.

## Stage gates
1. **Paper review:** instrumentation uncertainty accounting and complete DC source/load capture independently checked.
2. **Hardware approval:** actual BOM, supply limits, supervision, safety and isolation agreed.
3. **Bench trial:** independently recorded raw observations and controlled runs.
4. **Evidence review:** second reviewer validates inputs, geometry, provenance, repeatability and alternatives.
5. **Release:** public Journal article only if verified, with explicit uncertainties and negative findings, without claims of suppression.
