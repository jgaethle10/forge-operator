# HumanFilter v0.1.4 QA report | 2026-10-26

Local code and DOM fixture checks:
- 11/11 deterministic rule tests passed.
- Facebook, Reddit, YouTube simulated feeds passed hide/reveal/rescan/settings/virtualization.
- Native root-of-post AI disclosure label test passed.
- 300-card stress, 100 rapid changes, popup settings and recycled-card reveal tests passed.

Not yet claimed as passed for this exact build: GitHub Actions fresh runner integration / live platform checks. Real v0.1.3 YouTube native card title mutation was tested successfully on October 26, 2026, but that does not establish that unlabeled media is detected. Reddit public page was HTTP 403 from the QA IP and Facebook displayed a login-restricted public page. Real users and production social feeds remain a release gate.

Known limitations: this is a local, text-and-label-based filter. The original broad AI image/video detection vision is NOT fulfilled. A public beta may be distributed only with precise claims and a conspicuous limitation notice.
- Additional 41-case disclosure-versus-discussion synthetic corpus: 21 declared positives and 20 human discussions; 0 mismatches after correcting a false-positive rule. This corpus is manually authored and cannot establish real-world precision, recall, or unbiased detection.
