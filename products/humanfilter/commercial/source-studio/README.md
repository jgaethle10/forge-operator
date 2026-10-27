# HumanFilter RC3 / original live-action capture intake

This is a private, offline, phone-first capture utility for the missing real human-action plates in the **HumanFilter RC3** commercial. It is not a finished ad, website deployment, voice model, or permission to publish.

## On the phone

Open `mobile-capture.html` in a compatible mobile browser. Choose **Film with camera** or select an existing video for any of the four shot prompts. A partial set is fine. Review your footage, check the permission/consent statement *only if accurate*, then tap **Export private source pack**. The videos and metadata are zipped on your device. **Nothing is uploaded automatically.** Share the ZIP through a private channel only after checking the contents.

The standalone file works without a backend and loads no third-party scripts, fonts, trackers or assets. Some mobile file-viewer apps disable scripts; open it in a normal browser or host the unchanged file on a trusted first-party HTTPS origin. For large clips, keep each under 250 MB and export fewer files per ZIP to avoid mobile browser memory limits.

## On the Fallen ingest machine

`python3 ingest_live_action.py --zip /path/to/private-pack.zip --out /path/to/new-output-folder`

This reads the ZIP without any network connection, checks its structure and attested permissions, validates original media via `ffprobe`, compares SHA-256 against any client-submitted digest, preserves byte-identical footage and samples three frame evidence images per shot. It writes `intake-receipt.json` and `production-needs.json`. Requires Python 3.11+ and FFmpeg/FFprobe.

**Meaning of TECHNICAL_ACCEPTED:** file integrity, codecs, dimensions and media duration were inspected. It **does not certify** a person is depicted, visual composition, actual legal rights, creative performance, or owner approval. All those must be reviewed separately. Original footage remains private and should never enter public GitHub Actions artifacts or repo commits.

## Missing audio and live action

This does not claim Bella's voice or the synthesized score auditions have passed creative review. It also does not claim the previous controlled-fictional-sample product footage contains a real person. Fallen must mix and render only after original live-action media, genuinely approved Bella performance, sound rights, review and publication approval exist.