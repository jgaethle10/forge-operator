# Evercraft Roman edge shell

## Purpose
Read-only, complete HTML front door that serves the verified campaign information even if Base44 is suspended. A separately hosted Wix mirror remains available. The edge shell's HTML is embedded at build time and does not depend on a remote host; optional mirror mode validates remote content before returning it, and always falls back to embedded HTML.

**This code does not intercept the existing domain.** Browsers still follow the public DNS. Current `voteroman.com` points to suspended Base44. No frontend script, service worker or other third-party site can alter that for new visitors.

## Deploy conditions
1. Verify domain registrant and receive authorization to edit the existing GoDaddy DNS. Do not use account-recovery bypasses, trigger Paola's OTP, or contact her or the campaign without explicit approval.
2. Deploy as a standalone Workers service on a **preview host only**. Set `PREVIEW_HOSTS` to the exact public preview hostname and test `/_evercraft/health`, root, donate redirect, all existing public routes and TLS.
3. In Cloudflare, confirm domain control/activation prerequisites and map only the intended apex and `www` routing through a documented, authorized DNS change. **Never change authoritative nameservers wholesale.**
4. Preserve `donate.voteroman.com`, its Wix CNAME, all existing MX, SPF, DKIM, DMARC, and any campaign integrations. Test donation *checkout* independently with owner approval.
5. Only after public edge verification (mobile and independent runner) publish the cutover receipt and assert `voteroman.com` is live.

Do not enable redirect to the backup or alter website indexing without candidate/authorized owner review.

## Validation
`node --test campaign-recovery/roman-2026/edge/worker.test.mjs`

## Content updates
`embedded-site.mjs` mirrors `public/campaigns/roman/index.html`. Regenerate from canonical HTML via `JSON.stringify(html)`; validate unchanged candidate and donation markers. Do not add private voter records, scripts, or account credentials.

## Production status
Currently **not publicly routed or deployed at voteroman.com**. Existing independent Wix mirror is live; GoDaddy apex still points to Base44. Worker alone does not change DNS, ownership or TLS.
