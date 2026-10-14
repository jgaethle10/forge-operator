# Evercraft Live Production Stage

This is **one read-only broadcast view** inside the existing Forge Operator web runtime, not another control-plane app or an agent execution service.

## Open

- After a reviewed deployment of the branch, use `/live/` on the existing Forge origin.
- Before deployment, open `public/live/index.html` locally in a normal browser. A public internet connection is required to load GitHub data.
- Capture the browser window in TikTok LIVE Studio on Windows. Use **Broadcast view** to hide editing controls. For portrait streaming use a narrow browser window and zoom as needed, then capture only that window.

## What you can show

**Work** presents observed public main-branch commits, links and matched GitHub Actions run state.
**Build** retrieves exact changed-file names and additions/deletions for a selected commit.
**Proof** explicitly separates public source evidence, matching CI evidence, *unverified deployment*, and *unverified owner/customer acceptance*.
The sidebar shows real public GitHub Actions and open pull requests. Operator-entered mission and notes are clearly identified as manual, not provider-verified. The page refreshes its public source view every five minutes when visible, with manual Refresh and explicit connectivity/error state.

## Security and truth boundaries

- Only `https://api.github.com/repos/jgaethle10/forge-operator` is fetched, using unauthenticated read-only GETs.
- Do not put private issue text, customer data, tokens, terminals, or confidential work into this stream. A public repo is not a safe boundary for private information.
- No repo write, GitHub OAuth, agent execution, shipping, payment, publishing, or deployment commands are available from this page.
- HTTP/API failure or rate limiting shows a visible error, not fabricated activity. No GitHub run becomes verified for a different commit SHA; no CI result proves public delivery.
- Notes/headline are browser-local convenience data and do not sync to Systemia. Use the existing Systemia admission and verifiers for actual company authority.
- The frame art, animations and illustrative nodes are decorative; only linked GitHub facts carry evidence value.
- No production release is claimed until the exact deployed route is independently verified.

## Test

Run `node --test tests/evercraft-live.test.mjs`. For visual acceptance, open the page in a browser in both portrait and desktop sizes and exercise all three scenes. Browser API access can be rate-limited, so the local offline experience may accurately report unavailable evidence.
