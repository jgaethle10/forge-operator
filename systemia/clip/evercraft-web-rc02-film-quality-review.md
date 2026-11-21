# Evercraft Web commercial RC02: performance review and release gates (2026-10-20)

## Why RC01 failed
The 27-second RC01 consisted largely of oversized text over repetitive radar circles, with minimal product behavior. It prioritized explaining architecture over showing a buyer the experience. Film RC02 is not a final public ad.

## RC02 production study
- Story: editorial public-page concept → question about provenance → one URL in an illustrative Evercraft Web workspace → extracted example text and receipt → brand payoff.
- 19.5-second independently authored 1280×720, 24-fps H.264 video.
- Fully original Python/OpenCV/Pillow motion plates with perspective animation and browser-interface visual concept. No licensed footage or third-party video generation.
- Original 44.1-kHz stereo sampled piano/strings and synthesized Foley, transition impacts and mastering. No synthetic/robotic voice-over.
- Representative source uses reserved `northfield.example` domain; the source, URL, output and receipt are **all illustrative**. The UI is not a recording of a production endpoint and the shown digest fragments are NOT actual run output.
- Local MP4 SHA-256: `60d52d78a83aaf7cece9bc9d3c8282d2bfe9b6f996afa531c934e6f7b3ec7e6d`.
- Local artifact in ChatGPT conversation: `evercraft_web_rc02_concept.mp4`. Not uploaded to GitHub or published via Clip.

## User quality gate
Founder explicitly rejected RC01 as **not even close** to intended commercial quality. RC02 is a step to review, **not a declaration the requested high-quality standard has been met**. Important unresolved premium ad requirements: visual reference and performance direction, live actual UI recording from a customer-proven product, independent audio audition, approved human-voice performance, verified CTA, and final Clip campaign.

## Actual product delivery remains a separate HOLD
Official Evercraft Web published MCP manifest on main still references Base44. Owned public Fetch replacement PR #1385 is source + CI candidate. Browser Worker PR #1168 is source + CI candidate. Do not call production available, put instant-signup/checkout CTAs into public ads, or assert TinyFish feature parity. Run the existing `scripts/evercraft-web-cold-client-canary.mjs` **against an externally reachable owned endpoint** and obtain a passing production receipt before advertising access.

## Next film step when release is real
Record a real same-origin Fetch call to a public URL and capture the requested/returned body and evidence hash. Use that receipt's exact source URL, timestamp and digest in final-video motion graphics. Restore privacy-safe pilot lead intake, Systemia/CRM and payment fulfillment tests before go-live. Final publication requires human approval in Evercraft Clip.