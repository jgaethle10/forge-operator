# Social Spectacle Engine

The Social Spectacle Engine exists to stop Evercraft's public feeds from becoming a graveyard of generic announcements, text cards, and posts that technically shipped but were not worth watching.

It is a **selection and production-admission machine**, not a clickbait generator. Every 15 minutes the Systemia resident cycle can inspect newly admitted physical-world signals and decide whether any of them deserve the hero lane.

The rule is simple:

> **A no-op is better than a boring post.**

## What earns the hero lane

A candidate needs source lineage, a supported evidence state, and an actual visual story path. The strongest path is an explicit physical phenomenon that Fallen can animate from source-grounded data. Time series, real verified media, and geographic explainers are also eligible. A plain summary with no visual grammar is background, not social content.

The score rewards visuality, motion, anomaly, reliability, source diversity, geography, surprise, and novelty. Recent subjects are penalized so the feed does not become six variations of the same idea.

The machine targets roughly **two hero-grade pieces per day** and caps admission at four publishable packages per day. Those are quality targets, not quotas. It will publish nothing rather than manufacture filler.

## Production standard

Every admitted candidate carries a production contract:

- Fallen is the preferred production runtime.
- Real/source-grounded visuals come before generated imagery.
- One phenomenon gets one clear visual grammar.
- Motion, color, brightness, scale, time, and geography must mean something.
- Source labels and uncertainty remain visible.
- Text-card-first production is forbidden.
- Captions use substantive paragraphs, not one-line staccato.
- Each piece should explain what the viewer is seeing, why it matters, what the evidence supports, and what remains uncertain.
- A deeper Journal treatment is preferred when the subject deserves it.
- The default derivative family is a 9:16 hero, a 16:9 explainer, and a 4:5 loop/still.

## Distribution and authority

Evercraft Clip remains the publisher. The spectacle engine does **not** grant itself platform authority.

A candidate must still clear Fallen master QC, the 10/10 editorial preflight, Clip's verified intake receipt, the configured standing brand authorization, and a provider-visible publication receipt.

R&B Chicken and Soul remains explicitly blocked from this machine. High-stakes political/electoral and public-health subjects are held for editorial review instead of entering the autonomous entertainment lane.

## Why this exists

Evercraft has enough research, world-state sensing, mapping, newsroom, visual-production, and distribution machinery that its public pages should feel alive. The goal is not higher post count. The goal is that opening the feed should regularly produce the reaction: **"Wait, what am I looking at?"** and then answer that question with real evidence.


## Production loop

The selector is paired with a second resident cycle, `social-spectacle-production`, so an admitted hero candidate does not merely sit in a JSON queue.

For explicit Fallen phenomena, the production cycle now:

1. compiles both vertical 9:16 and landscape 16:9 Phenomenon Canvas stages;
2. creates the owned distributed-render plan;
3. holds safely at `ready_to_render` when render workers are unavailable;
4. when workers are configured, renders the vertical hero through the Fallen distributed worker fabric;
5. runs master QC on the exact assembled bytes;
6. runs a ten-check social editorial preflight;
7. builds an evidence-bound Clip manifest;
8. stages the verified master into the first-party Evercraft Clip queue.

Clip now accepts SHA-verified distributed Fallen masters in addition to timeline exports. The staged manifest itself is also digest-bound into the intake receipt, so metadata or gate fields cannot be modified after intake and silently published later.

The producer still does not claim a social post happened. A finished package stops at `ready_for_clip_publish` until Clip resolves a real authorized destination adapter and receives provider-visible publication evidence. That distinction is deliberate: **finished media is not the same thing as a published post.**
