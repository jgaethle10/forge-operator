# HumanFilter v0.1.3 beta candidate

- Supports YouTube Shorts `ytd-reel-item-renderer` in addition to existing video card selectors.
- Recognizes exact standalone visible AI disclosure labels in post metadata when rendered as leaf elements (e.g. `AI info`).
- Strict mode now recognizes standalone uppercase `AI` and `GenAI` in titles and post text. This filters discussions about AI too; it **does not infer AI authorship**.
- Remains entirely local and reversible. No image or video classification, no C2PA verification.

**Release gate:** public social-feed posts with real disclosures and a normal browser install must be verified. This is a beta, not a universal AI content blocker.
