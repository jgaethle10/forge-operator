# HIST-TECH-001 | Historical Technology Claims & Benchmarks

**Status:** source-only research proposal, not admitted Systemia execution and not a live hardware deployment. Parent tracking issue: [#1835](https://github.com/jgaethle10/forge-operator/issues/1835); related but distinct UAP evidence lane: [#1832](https://github.com/jgaethle10/forge-operator/issues/1832).

## Mandate
Treat the 2026 Gaia *Forbidden Technologies: Humanity's Stolen Future* promotional trailer as **claim discovery**, not as scientific or historical substantiation. Preserve uncertainty. Search patents, primary source archives, peer-reviewed work and independent engineering measurements. No derived frames, voices or other unlicensed documentary assets committed here.

**Claim classification is claim-specific:** documented historical event; experimentally demonstrated mechanism; unresolved technical claim; contradicted/refuted claim. "Unresolved" is not proof of suppression or proof of new physics.

## Priority order
1. **Tesla / Wardenclyffe:** historically real unfinished power/communications experiment. Global grid-scale energy transfer was **not** shown working at Wardenclyffe. Separate transmission from generation and identify actual energy source. Tesla Science Center: https://teslasciencecenter.org/teslas-wireless-power/ .
2. **Wireless power with modern baselines:** MIT 2007 resonant inductive transfer demonstrated 60 W over >2 m at around 40% **transfer-stage** efficiency (DOI 10.1126/science.1143254). Do not misrepresent this as wall-to-load performance or free energy. https://pubmed.ncbi.nlm.nih.gov/17556549/
3. **Keely claims:** historically instructive negative control. NEH reports concealed compressed-air feeds; not a demonstrated new force. https://www.neh.gov/humanities/2010/mayjune/curio/the-etheric-force-machine
4. **Medical/frequency claims:** no clinical efficacy statement without a specified intervention, condition, comparison, independently assessed human evidence and relevant safety approval. No human experimentation.
5. **Antigravity / overunity / other:** source claims first, technical hypotheses second, simulations next if useful. Do not assume hidden technologies, recovered devices, or a conspiracy.

## Physical trial proposal (NOT authorized to run)
Start with a commercially available, low-voltage, current-limited inductive-coupling teaching setup or an entirely simulated equivalent. Do not repurpose high-voltage Tesla coils, mains, RF power amplifiers, hazardous devices or medical equipment. Review input current limits, thermal behavior, metal object heating, electrical isolation, shielding and meter accuracy before any supervised test.

Capture timestamp, operator, instrument make/calibration, setup photo/drawing, DC source current and voltage under load, receiver load current and voltage under load, duration, distance, coil alignment, frequency, ambient conditions and repeated trials. Measure source-to-load performance and, separately, any intermediate transmitter/receiver transfer efficiency. Check null control and misaligned control.

## Reproducibility
`node --test systemia/research/historical-tech/power-accounting.test.mjs`

The module validates a *hypothetical or independently measured* steady-state power budget and labels >100% reported efficiency as a **measurement anomaly**, never a validated over-unity result. It does not simulate electromagnetic coupling or substitute for instrument data. No fake measured results.

## Stage 2: DC data gate and research evidence
- [BENCH_PROTOCOL.md](BENCH_PROTOCOL.md): proposed low-voltage educational trial, safeguards, instruments and review gates. This is NOT permission to energize hardware.
- [SOURCE_AUDIT.md](SOURCE_AUDIT.md): original patent, MIT paper, independent history and WPC foreign-object heating evidence.
- [bench-evaluator.mjs](bench-evaluator.mjs): DC-only session evaluator that rejects missing provenance/uncertainty fields on entries claimed to be measured and flags missing controls or apparent >100% accounting.
- [synthetic-example.json](synthetic-example.json): invented software-only fixture. Its efficiencies are NOT measurements.

```bash
node --test systemia/research/historical-tech/*.test.mjs
node systemia/research/historical-tech/bench-evaluator.mjs systemia/research/historical-tech/synthetic-example.json
```

**Validation note, November 2, 2026:** The ten Node.js unit tests passed in an isolated local reproduction using the branch source copied into a local test directory (Node v22.16.0). This is local validation, not GitHub CI verification or runtime hardware evidence. Re-run tests in an independent repository checkout before merge.

## Stage 3: physics model (2026-11-04)
- [coupling-model.mjs](coupling-model.mjs) implements the ideal-coaxial-circular-filament Neumann integral with numerical convergence checks; [coupling-model.test.mjs](coupling-model.test.mjs) tests reciprocity, distance dependence, turns, far-field behavior and guardrails.
- [COUPLING_MODEL.md](COUPLING_MODEL.md) documents physical assumptions and explicitly **model-only** coupling-vs-separation predictions.
- GitHub CI now runs the complete Node research test suite including the stage-3 physics model.
- The numerical model does **not** predict electrical efficiency, delivered watts, over-unity energy, actual product performance, or support claims of hidden technologies. A successful CI run does not demonstrate a bench result.

## Review and authority gates
- Systemia is authoritative for mission admission, agent delegation and signed receipts. Neither GitHub commits nor an issue prove that workers have executed.
- Physical setup, tests, external claims or release require separate authorization and independent evidence/safety review.
- A documented reject decision counts as meaningful research. False positives do not.
