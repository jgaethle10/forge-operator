## Verification boundaries

The Evercraft public Pages workflow is configured to include the Roman campaign static HTML in its Pages build and request the resulting deployment route. Its post-deploy probe validates HTTP success, candidate name and original donation destination. This does not verify payment checkout completion, DNS cutover, link parity, candidate approval or an Evercraft-owned hardware host.

The canonical source lives at `public/campaigns/roman/index.html` and the Wix export copy at `campaign-recovery/roman-2026/index.html`. Public Pages URL, if Pages is enabled: `https://jgaethle10.github.io/forge-operator/campaigns/roman/`.

Do not equate a committed file, merged branch or successful compilation with an externally verified live website. Validate the published Actions deploy receipt and actual HTTPS route. Do not direct DNS to Pages until GitHub Pages custom-domain prerequisites and domain ownership are confirmed. Until then the target domain `voteroman.com` remains unchanged.
