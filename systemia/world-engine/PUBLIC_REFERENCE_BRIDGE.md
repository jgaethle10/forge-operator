# Public-reference GeoJSON bridge | Evercraft World Engine

**Status: development candidate, review held.** This is a read-only, point-only, source-preserving adapter. It introduces **no** EverMaps synchronization, RIVET/EV customer geometry, NASA affiliation, site-plan generation, deployment, billing, or public release. It is intended for an eventual authorized handoff from an existing mapping UI into Evercraft World Engine and Systemia.

`compilePublicReferencePoints(collection, {lat,lon})` consumes an RFC 7946 `FeatureCollection` of WGS84 point features with explicitly declared source and authority metadata and produces `evercraft.world-engine.public-reference-overlay.v1`.

The output stores original WGS84 coordinates, approximate local x/y/z meters **without** visual exaggeration, and source URL / source statement for every point. Display scale belongs exclusively to the renderer. Every resulting reference point has `engineering:false`, `collision:false`, `geology:false`, `navigation:false`, `physicalExtent:false`, and `launchOperations:false`.

Inputs containing polygons, line strings, invented footprints, approved engineering assertions, missing source references, malformed coordinate tuples, more than 256 features, or points more than 50 km from the specified origin fail closed. The calculated local-meter positions are approximate and unsuitable for civil engineering.

This adapter does **not** create runtime entities, physical collision geometry, mapped roads, actual launch trajectories, or independently verified coordinates. No NASA endorsement or current operational data is claimed.

## Test

```sh
node --test systemia/world-engine/public-reference-points.test.mjs
```

The existing EverMaps RC003 source remains in its own application workspace and is not implicitly synced into this GitHub repository. This new bridge is a separately authored public-safe interchange contract with synthetic unit-test inputs. It has also been exercised locally against the previously generated three-point Kennedy GeoJSON file, with all three references accepted and engineering authority remaining false.

## Release blockers

- Independent field/source verification of every actual exported reference point.
- A reviewed, versioned adapter into the canonical World Engine runtime and an explicit non-physical reference layer.
- Actual 390px/1440px desktop/mobile WebGL performance and UI acceptance testing.
- Permission and image/geometry rights checks where relevant.
- Systemia dependency, reviewer, and exact-output gates before merge, public deployment, customer use or professional reliance.

Reference record: Systemia `evermaps-world-street3d-20261013`; prior EverMaps RC003 source checkpoint `6acf188fa0dee32080bf5118`. No RIVET renderer source or customer data is included.

## Actual World Engine snapshot integration

`mountPublicReferencePoints(world, geojson, origin)` validates a real World Engine definition, adds the accepted reference overlay to `world.metadata.public_reference_points`, and bumps the world version. It does not create physics entities, colliders, materials, routes or renderable building assets.

`publicReferenceFrame(world, snapshot)` requires a cryptographically digest-verified canonical World Engine snapshot bound to the exact world definition and version before exposing source-labeled, **nonphysical** overlay annotations. It rejects replay tampering, stale/mismatched world definitions and authority escalation. This is a functional snapshot-to-annotation bridge, **not a completed 3D user interface**.

```sh
node --import tsx --test systemia/world-engine/public-reference-*.test.mjs
```

The World Engine GitHub workflow executes that command in addition to the existing runtime tests. Production still requires a reviewed renderer/UI adapter, browser visual and mobile performance acceptance, explicit source-location validation and the Systemia release gate.
