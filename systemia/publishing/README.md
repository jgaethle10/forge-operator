# Evercraft native Reddit publisher

Systemia-owned adapter for authorized Reddit publication. It deliberately has no browser-automation fallback.

Flow: Systemia admission -> content/policy gates -> authorized OAuth lease -> Reddit API -> publication receipt -> CHUM attribution/measurement.

Preflight:
`node systemia/publishing/reddit-publisher.mjs post.json`

Publish after the authorized OAuth lease exists:
`node systemia/publishing/reddit-publisher.mjs post.json --publish`

A subreddit post must carry a current community-rules check. Every post must disclose Evercraft affiliation. The adapter rejects unsolicited DM and vote-solicitation flags. Missing authorization blocks publication instead of silently switching providers.
