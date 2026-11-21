# FIRST-CONTACT-001 | MAT-001 materials / THz feasibility screen
**Date:** 2026-11-03. **Status:** completed desk-level evidence screen; no specimen acquired or independently measured.

## Claim being tested

A magnesium (Mg) alloy specimen, publicly described as part of a 1947 extraterrestrial crash recovery, was alleged to contain layered materials suitable for a terahertz (THz) waveguide and associated antigravity behavior. The purported origin and physical claims are not independently established. Assess the **specific material and waveguide assertions**, not every possible UAP technology.

### Source evidence (attributed, not our laboratory measurement)

**AARO supplement to ORNL's analysis, July 2024:** https://www.aaro.mil/Portals/136/PDFs/Information%20Papers/AAROs_Supplement_to_ORNLs_Analysis_of_a_Metallic_Specimen.pdf

- ORNL compared measured Mg and Pb isotope ratios with terrestrial standards. AARO describes both as consistent with terrestrial manufactured material.
- Top-layer microscopy and elemental mapping identified bismuth (Bi) mixed with substantial lead (Pb), rather than an isolated *monocrystalline* Bi film.
- Zn concentrations of 1–4 weight percent and columnar magnesium grains perpendicular to Bi/Pb bands are documented.
- For the *particular proposed mechanism* involving crystalline Bi's dielectric anisotropy, the intermixing and structural properties did not meet the proposed single-crystal waveguide requirements.
- The historical chain of custody could not be verified. ORNL and AARO did not identify a unique historical manufacturing program or establish the item's original function.

**Disposition:** `TERRESTRIAL-CONSISTENT; CLAIMED_BI_THZ_WAVEGUIDE_NOT_SUPPORTED`. This is an official materials assessment. It does not logically test every imaginable waveguide geometry or every other specimen and is not proof that all extraterrestrial-life hypotheses are false.

## Engineering constraints required for a real THz device

A waveguide must have a defined working electromagnetic mode with boundary conditions and measured loss. For a **specific candidate design**, a legitimate test plan needs:
1. Actual phase composition and crystalline orientation for *each* relevant layer (XRD, TEM/EBSD when appropriate).
2. Layer thickness / lateral geometry and interfaces, with adequate spatial sampling.
3. Frequency-dependent **complex anisotropic permittivity** (not simply the presence of Bi) and known surrounding dielectric properties.
4. A predicted supported mode and transmission curve with insertion loss, bandwidth, direction dependence, reproducible sample coupling and control specimen.
5. Independently repeatable THz time-domain spectroscopy or validated equivalent measurement, with proper calibration and instrument response.

No approved readings of the actual specimen's full THz transmission or anisotropic dielectric tensor are available in the project data. We cannot compute a transmission coefficient by assuming an isotropic index or by using the surface appearance alone.

## First numerical control: frequency-to-free-space wavelength

Free-space wavelength is `lambda = c / f`; this is **not** guided-mode wavelength or a waveguide design prescription.

| Frequency | Free-space wavelength |
|---|---:|
| 0.1 THz | 2.998 mm |
| 1 THz | 299.79 μm |
| 10 THz | 29.98 μm |

Run `node systemia/research/first-contact/engineering-feasibility.mjs` or `node --test systemia/research/first-contact/engineering-feasibility.test.mjs` for the pure physical conversion.

## Proposed independent, safe next test

**Desk-only materials model:** select a well-characterized, commercially documented THz guide from established photonics literature, extract its dielectric tensor or frequency-dependent complex permittivity and geometry with source citations, predict transmission using a published electromagnetic solver, and compare against reported measurement. This **tests our analysis pipeline**, not a recovered alien specimen.

**Falsification gate:** Without matching phase structure, crystal alignment, appropriate dielectric contrast, and measurable reproducible transmission, the claimed mechanism is unsupported. A remaining mystery about provenance is not evidence of exotic function.

**No-go:** no suggestion to fabricate or acquire an unverified recovered specimen, no antigravity branding, no claim that frequency-to-wavelength calculation implies exotic effects.
