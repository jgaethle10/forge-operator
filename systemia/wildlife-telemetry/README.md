# Evercraft Wildlife Telemetry | Candidate v0

**Status:** Research-stage capability only. NOT publicly released, NOT a live animal locator, NOT a commerce or paid-data entitlement.

Systemia mission: evercraft-wildlife-migration-observation-001

UI host: Evercraft Wildlife Atlas (Base44 app ID 6936686f7e6895fc4e62fb0f), route /migration, source checkpoint 6ad011abe8c19d3bf09872eb. The Atlas currently runs its own copy of the same parser; **do not change either copy without verifying parity**, and prefer one canonical package before general rollout.

## Why it exists

The existing Wildlife Atlas MigrationRoute entity is a **sourced description of species or population movements**, not a timestamped individual GPS track. This candidate adds a separately typed observation path. The browser can open consented CSV or GeoJSON Point-feature research exports, validate coordinates and dates, separate animal IDs, play observations over time, flag temporal gaps, and report **sampled great-circle segment distance only**.

Never create fake GPS observations from a map, social-media screenshot, region name, article or modeled population corridor.

## Candidate contract

- Input: up to 50,000 records / 3 MB on the browser viewer; CSV columns timestamp,latitude,longitude,animal_id or GeoJSON FeatureCollection of Point features with properties.timestamp.
- Required: at least two valid dated fixes; latitude [-90,+90] and longitude [-180,+180]. Sort by timestamp, reject invalid locations, ignore identical observations.
- Output: validated local points, rejected count, elapsed days, distance between recorded fixes, count of adjacent gaps greater than 7 days.
- Processing: file remains in the browser. No automatic upload, model invocation, persistence or broadcast of sensitive fixes. Note: OpenStreetMap tile requests still reach a third party.
- Data governance: owner authorization/license, collection period, study ID, citation, release tier, and protection of sensitive species/den sites required before public distribution. Local research view alone is not permission to publish.
- Do not imply individual tracks reveal causation for weather, pollution or habitat changes.
- Add security/QA/consent checks before operational deployment. Integrate with FAIE/Earth Atlas only with evidence-proven contracts and location redaction.

## Validation

Run: node --test systemia/wildlife-telemetry/*.test.mjs

These are unit checks, not browser/performance validation.

This GitHub branch is a portable implementation and reproducibility trail. The app's Base44 checkpoint does not automatically synchronize to this repository. A future package extraction should eliminate duplication. A green parser test is not a green published URL or completed Systemia release gate.
