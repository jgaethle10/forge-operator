# Harbor -> Fallen | first private customer media transfer (SAFE RECEIVER)
Date: 2026-11-19 | Status: source helper committed; **NO live network route, file receipt or Studio acceptance verified**

## Decision
Harbor's provider-controlled machine `muse` is requesting access to a Tailscale network. **Do not approve just because the hostname is expected.** A Tailscale device approval is network access, not a single-file drop. Verify the actual device owner/user/OS, trust, and allowed reachability with the tailnet admin. The existing authorized NextGen Node002 is the preferred potential customer-media receiving machine, **only after checking its real Tailscale membership and available production operator**. Penguin Node001 remains the coordination host.

Taildrop can send encrypted peer-to-peer files without creating a new upload API or sending service credentials, but Tailscale documents it as a **same-user, untagged personal-device** feature that can work despite normal ACL restrictions. Use it **only** if the devices and account actually qualify and are trusted; do not invite a vendor-managed cloud worker onto a broad production tailnet solely to enable Taildrop. Otherwise hold until a narrowly authorized push-only SFTP (no shell, jailed directory, exact sender) or an owned private intake endpoint is provisioned. **No third-party consumer cloud, public GitHub artifact or open internet listener.**

Tailscale source links:
- https://tailscale.com/docs/features/access-control/device-management/device-approval
- https://tailscale.com/docs/features/taildrop

## Owner NextGen read-only preflight (run locally, not in Harbor)
```bash
printf 'Node: '; hostname
printf 'Tailscale binary: '; command -v tailscale || true
printf 'Tailscale connected: '; if command -v tailscale >/dev/null && tailscale status >/dev/null 2>&1; then echo yes; else echo no_or_unknown; fi
printf 'FFmpeg binary: '; command -v ffmpeg || true
printf 'FFprobe binary: '; command -v ffprobe || true
printf 'Node binary: '; node --version 2>/dev/null || true
```
Do not paste Tailscale auth keys, machine keys, all peer IPs, customer filenames, or buyer video into public issue comments.

## Private manifest and intake contract
Harbor prepares *privately*, using a source batch with exactly 12 files:
```json
{
  "schema":"evercraft.harbor.private-media-manifest.v1",
  "assets":[
    {"filename":"asset-001.jpg","bytes":12345,"sha256":"64_lowercase_hex_digest","mediaType":"image/jpeg"}
  ]
}
```
Example illustrates one row only: real pilot manifest has twelve. The 12 asset files must be in a dedicated directory containing no extra files. Use simple flat filenames. Original source names/provider IDs and the full customer brief are confidential and must remain outside GitHub. Renaming for private transport requires a clearly paired manifest mapping so source provenance is preserved.

Approved image media types currently `image/jpeg`, `image/png`, `image/webp`, `image/heic`; video `video/mp4`, `video/quicktime`. If a file uses a different format, **hold for reviewer**. Do not incorrectly relabel a source to force acceptance. The helper checks actual leading media signatures, size, hashes, no symlinks/hardlinks, flat names, duplicate names, extra/missing files, per-asset up-to-2GB and total 3GB; it is not a full virus scanner or decoder inspection.

## After an approved transfer, on the ACTUAL owner-controlled NextGen receiver
```bash
cd "$HOME/forge-operator"  # replace ONLY with the actual verified checkout
umask 077
node scripts/nextgen/verify-harbor-private-media-import.mjs \
  /private/fallen-transfer/manifest.json \
  /private/fallen-transfer/assets \
  /private/fallen-transfer/verified-receipt.json \
  authorized-human-operator
```
The paths above are **examples, not known existing directories**. Receiver must ensure private directory ownership/permissions first, and run the script only on a validated owned host. Do not run from Harbor's sender machine and call that a receiver receipt.

Output state `BYTES_REVERIFIED_ONLY` means only that the receiving machine hashed its locally present assets, not that its owner/device was cryptographically attested, the sources are licensed, Systemia admitted the job, Fallen accepted production, or any preview is cleared for release.

## Only after receipt
1. A verified, named human/Studio operator accepts a bounded job using Systemia admission/Passport.
2. Independently check full media decodability (ffprobe/inspected playback), media subjects, audio, license/permission per asset, offer/CTA, and customer's explicit rejection of any jar-pickle-with-voice segment.
3. Use authentic Fallen commercial assembly and independent creative/audio/picture review. Prior first preview is **rejected evidence**, never production input to reuse.
4. Founder approves **exact** replacement preview and accompanying message before any Harbor customer transmission.
5. Harbor delivers only an approved preview through already authorized Page Messenger; accepts legitimate revision feedback and only after client approval sends correct $50 hosted provider link. Clean master after independently verified payment.
6. Release receipts are private, with only sanitized milestone/status in GitHub.

## Sources
- `systemia/intake-fabric/README.md`
- `scripts/nextgen/README.md`
- `systemia/media-studio/SOURCE-FIRST-COMMERCIAL.md`
- `systemia/media-studio/client-commercial-preflight.md`
- `scripts/nextgen/verify-harbor-private-media-import.mjs`
- issues #2280 (handoff), #2284 (incident)
