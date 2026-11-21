# Fallen Studios | Open-source production toolchain v1

**Evercraft LLC | Systemia → Work Saban → Fallen Studios**
**Status: Integration branch only. No public commercial, node deployment, GPU rental or paid job.**

## Why this exists
Evercraft already owns its FFmpeg rendering, edit timelines, audio mastering and creative review gates. This integration connects that owned production graph to open-source editing and generation software rather than replacing our existing engines.

See toolchain-registry.json for upstream Git repository identities, audited commits and license classes. A GitHub commit in a manifest does not mean the upstream tool has been installed or executed.

| Tool | Verified role | Current readiness |
|---|---|---|
| FFmpeg | Existing local Fallen encode, decode, probe and mastering | Existing capability; not newly installed |
| AcademySoftwareFoundation/OpenTimelineIO | Real Fallen JSON -> native OTIO file, native parse roundtrip, frame-cut/trim/gap and provenance check | Integrated with pinned Python package 0.18.1; CI-tested |
| Comfy-Org/ComfyUI | Local-only API probe and a hash-pinned, node-allowlisted, operator-attested queue contract | Connector implemented and mock-tested; no live node/model/GPU admitted |
| Blender | Headless 3D/VFX workflow possible on trusted owned machine | Source audit and local binary discovery, NOT deployed |
| Kdenlive / MLT | Optional native GUI NLE and MLT renderer | Source audit and binary discovery only |

## Commands on an authorized local machine
Read-only capability probe:

    node systemia/media-studio/open-source/local-capability-probe.mjs

Safety test suite:

    node --test systemia/media-studio/open-source/toolchain.test.mjs

Install official Apache-2.0 OTIO Python library, isolated from the app:

    python3 -m venv .venv-otio
    .venv-otio/bin/python -m pip install opentimelineio==0.18.1
    .venv-otio/bin/python -m unittest discover -s systemia/media-studio/open-source -p test_otio_bridge.py -v

Export a FallenTimelineProject whose media paths and digests point to real locally owned or licensed media:

    .venv-otio/bin/python systemia/media-studio/open-source/otio_bridge.py /trusted/project/timeline.json /trusted/export/evercraft.otio --verify-media --asset-root /trusted/project

No external-hosted vendor runner or automatic GitHub release is invoked. OTIO is a real editorial interchange file, NOT a video, and it does not automatically import edited timelines back into Evercraft. This first export supports video, overlay, voice, music, and SFX tracks; it rejects unsupported captions, same-track overlaps, invalid frame alignment, pending generation, missing provenance and changed media digests. Placement, audio-mix automation, color grade and other Fallen-native effects need a separate NLE conform pass.

## ComfyUI / safety boundary
Only an explicitly verified http://127.0.0.1:port local server can receive an action. The caller must provide source-reviewed hardware/model attestation, explicit private execution authorization, a workflow digest and a reviewed node-class allowlist. A POST returning a prompt ID means queued ONLY, not generated, continuity-approved, rights-approved, client-deliverable or published. No public endpoint or automatic spending is permitted. No ComfyUI workflow has been sent to the user's computers in this release.

## Upstream licensing and outputs
The connector glue is Evercraft-owned; upstream remains independently licensed. OTIO is Apache-2.0; ComfyUI and Kdenlive are GPL-3.0; Blender uses GPL-family licensing; MLT uses LGPL with component variations; FFmpeg's effective license depends on enabled codecs and build flags. Always review redistribution obligations and model-weight/custom-node licenses independently. Commercially usable media outputs do not imply ownership of the upstream projects or permission to portray stock people as Evercraft employees.

## Evidence and next gates
The repository workflow fallen-open-source-studio.yml uses a disposable, controlled CI machine. It actually installs OpenTimelineIO, tests the connector boundaries, creates synthetic CI footage, exports a native OTIO project, reads it back via the library and saves audit receipts. It does NOT use private customer footage, install anything on Penguin/NextGen, activate a live GPU, or grant publication rights.

Next: safe OTIO edit re-import, approved host probes, one real GPU and ComfyUI worker test with vetted weights, Blender scene worker admission, and a genuinely excellent 5-second Evercraft shot before spending more energy on a 30-second ad. A passing CI test is an engineering milestone, not evidence that the creative quality is solved.
