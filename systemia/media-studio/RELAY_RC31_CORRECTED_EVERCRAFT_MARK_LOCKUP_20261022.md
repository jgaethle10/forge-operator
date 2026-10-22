# Evercraft Relay RC31 | Corrected metallic brand lockup | 2026-10-22

**Owner feedback:** EVERCRAFT wordmark unintentionally overlapped the metallic E/symbol in RC30 final shot. Owner subsequently supplied eight additional Evercraft-logo aesthetic references including dark brushed steel / champagne-gold and blue atmospheric treatments, plus vivid neon/flame variations.

## Actual executed fix
- The original brand artwork from owner reference `2A1B5272-9E4D-4381-90F8-6EAFBF9C835A.jpeg` remains the source for the film. The new standalone generative mockup is a **concept study**, not a substitute for brand-source-compliant animated production frames.
- RC28B `visual_finale.py` compositor had symbol at y=1128 / height=375 and wordmark at y=1450 / height=59, creating about **53 px of spatial overlap**. Revised symbol to 414×337 at y=1122 and wordmark to 568×57 at y=1495: symbol ends at 1459 and wordmark begins at 1495, giving **36 px of guaranteed layer-bounds clearance** (plus transparent-edge clearance). Both are centered, cropped separately, natural proportions retained.
- Also removed a transient dark circle at center x540/y530 which briefly appeared above the RELAY lettering during the inherited logo-reveal animation.
- **Only frames 791–930** (140 closing frames) were rebuilt. Original RC30 footage through frame 790 and the full compressed stereo AAC soundtrack were copied unchanged. The media source clip is still private, never published.
- 1080p: `Relay_RC31_Corrected_Evercraft_Lockup_1080p_PRIVATE_REVIEW.mp4` SHA256 `f7d24735f5c2ffccfef7979945190dc71bfa9a59e84cce8b1e8edb35e2c0f23c`.
- Phone 720p: `Relay_RC31_Corrected_Evercraft_Lockup_iPhone_720p_PRIVATE_REVIEW.mp4` SHA256 `09ddbd765cae65bb4c56143816e77582b0cce30424f7f63ad27f47d66c90ec6f`.
- Both have **931 video frames at 30 fps, 31.033 seconds, H.264 video / 48k AAC**; complete FFmpeg decoder passes; audio elementary stream SHA256 on RC30, RC31 1080 and 720 is identical: `1cf63830200fc215397f974ff69238c078f3831e6e8a542d28ceb1bf75643937`.
- End-card and seam preview: `Relay_RC31_Final_Corrected_End_Card.png`, `Relay_RC31_Final_Quality_Check.jpg`.
- Media and script ZIP shipped to founder: `Evercraft_Relay_RC31_Corrected_Logo_Launch_Review.zip`. Video bytes are **not committed to GitHub**.

## Standing studio truth and release gate
Underlying song “Driving Ambition” by Ahjay Stelino is sourced from Mixkit; Evercraft Music did not compose it. Voice Kokoro af_bella directed by Voice Foundry. Earlier footage is illustrative stock actors; fictional structured meeting milestones require human confirmation. The film remains founder-review-only pending final viewing, media-rights signoff, reliable customer contact handoff, exact publisher/payload authorization, and owner-defined launch time 10:28 / 2:05 / 7:04 America/Los_Angeles. No release, payment, outreach, scheduling or advertising performed.

The eight new logo still treatments can inform future *studio identity motion tests*, but this Relay ad preserves dark steel with understated gold rather than adding cartoon/explosive styles that might distract from the product.
