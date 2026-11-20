# Kennedy Drawing Studio · reference calibration and evidence record

Status: operator-assisted concept drafting, **not** surveyed engineering, GIS georeferencing or construction plans.

## Workflow
1. Obtain a lawful, site-specific overhead image. Document who supplied it, date and the allowed use. Site imagery and a distinct vicinity image are loaded locally in the browser and are **not** uploaded to the Site Planner server by the drawing studio.
2. Upload the **site** source image. This resets the fictional demo charger layout, earlier marks, any unfinished reference selection, and any previously stored calibration.
3. Find an independently known, reliable distance **visible in that exact same image**. Enter that length in feet (1–10,000). Never invent an estimate from an undocumented road, stall, or building width.
4. Select **📏 Reference**, then click or tap the two visible endpoints. The endpoints must be at least 20 SVG drawing units apart. Invalid lengths, tiny baselines and attempts to calibrate the synthetic demo are rejected.
5. The source image is displayed using a fixed SVG 805×590 viewport with `preserveAspectRatio="xMidYMid slice"`. The reference is an *on-screen image-plane* calibration, not a geographic CRS. Its scalar is `feet_per_svg_unit = known_reference_feet / hypot(x2-x1,y2-y1)`.
6. Draw route endpoints and proposed charger/equipment placements. Estimated route line lengths use that operator reference conversion. Every estimate is labeled provisional; no clearance, grading, road, transformer, equipment or conduit routing compliance is implied.
7. Export both vector sheets and **Download evidence JSON**. This contains site name/address, revision, filenames, source-byte SHA-256 when supported by the browser, reference endpoints, operator-entered known length, marker positions, route estimates and explicit evidence limits. It intentionally **does not embed or upload the raw images**. Retain those authorized source files privately with the exported manifest.

## Evidence limitations
- A SHA-256 fingerprint authenticates *byte matching* only. It does not establish image ownership, capture coordinates, orthorectification, authoritative dimensions, legal rights or source truth.
- The user-entered length is not surveyed or automatically checked. Perspective distortions, cropping, unknown camera projection, parallax and different elevations can invalidate image-distance approximations.
- The drawing continues to say **NOT FOR CONSTRUCTION**, **NO LICENSED SEAL**, and **OPERATOR REFERENCE · NOT SURVEYED** (or **SCALE UNVERIFIED · NTS** without a valid reference).
- Changing the site aerial discards any prior reference and marks to prevent attaching geometry from another property. Switching tools cancels a half-completed reference selection.
- The exported manifest is not cryptographically signed. It cannot prove that the measurements were entered honestly or that a reviewer approved the plan.
- The studio is a local browser workflow. It does not persist its drawing into the Site Planner project database or create a customer entitlement, paid job or Systemia action.

## Verification
Run `python3 -m unittest -v test_calibration.py test_plan_studio.py`, then `python3 -m unittest discover -v`. The calibration regression test checks zero-length, source-free and undersized baselines, measured route length, safe evidence export, and invalidation on image change. The broader workflow suite also tests private HTTP routing and commercial/payment holds.

## Next gates
Calibrated aerial coordinates, controlled project persistence, confirmed real parcel rights, licensed geospatial layers, north orientation, CAD output with correct scale, signed evidence receipts and qualified engineering review all remain future work.
