# Evercraft Rescue Mesh: opt-in resolver experiment

## What is genuinely new
A new recovery layer can live **in a consenting browser** rather than in a domain's DNS. When the owner of a hostname is unavailable, a locally installed browser resolver can map just that exact hostname to an independently identified copy before the request reaches the suspended host. It is **not** a universal DNS override, remote interception, or a replacement for legitimate control of the original domain.

This laboratory prototype provides a Chrome Manifest V3 extension that redirects user-enabled `voteroman.com` and `www.voteroman.com` top-level navigations to the already-working `https://fabric.systemiacommandcenters.com/campaigns/roman/` site. The independent fallback does not assert domain ownership. `donate.voteroman.com` is untouched.

## Browser contract
- **Opt-in:** Installing or loading the extension does not activate any redirects. The human must read the disclosure, check the consent box, and click Enable.
- **Explicit, reversible:** Disable immediately removes the one local dynamic rule. No server-side agent can enable the redirect remotely.
- **Tight scope:** Only original apex and www `main_frame` requests. No payment subdomains, subresources, monitoring of browsing activity, query tracking, or arbitrary update server.
- **Truthful address:** The browser displays the different Evercraft URL after redirect. It does not make a fake original-domain certificate or conceal where content lives.
- **Identity:** The copy is explicitly an independent informational fallback, not the live official domain or complete original functionality. Campaign or domain ownership/approval has **not** been newly established by this extension.
- **No authority escalation:** No GoDaddy account, no registrar login, no DNS writes, no OTP, no contacts, no billing, no voter data.

## Run tests
`node --test systemia/rescue-resolver/redirect-contract.test.mjs`

## Manual test on a consenting desktop Chromium browser only
1. Obtain the repository on the desktop and open `chrome://extensions/`, then enable Developer Mode.
2. Click Load unpacked and select `systemia/rescue-resolver/extension/`.
3. Open extension popup; read disclosure, check the box, click Enable.
4. Test new browser navigation to `https://voteroman.com/`. It should open the independent Evercraft site, showing its actual URL.
5. Check `https://donate.voteroman.com/` still visits the existing donation page without redirection.
6. Open the popup and click Disable; original domain navigation should follow its current DNS route again.

**No user browser has been enrolled and no published Chrome extension exists.** The integration suite uses only a disposable isolated Chromium profile and mocked network responses. A passing headless-browser check proves browser-level behavior within the test, not a public release, campaign approval, or original-domain DNS cutover. iOS Safari and ordinary browsers without this extension are not covered.

## Boardroom-style feasibility review (design-only, not a claimed live team session)

| Research lens | Technical outcome |
| --- | --- |
| DNS/transport | A hostname reaches the authoritative resolver/hosting chain before server-side fallback code; no code can alter third-party DNS for all users. |
| Browser/UX | Explicitly installed local navigation interception can bypass a dead HTTP origin for participating users. |
| Safety/identity | No stealth rewrites, hidden destinations, credential collection or unofficial domain-ownership claims. |
| Saban automation | Test manifests/rules and a fail-closed release in CI; this does **not** claim Saban agents executed outside GitHub. |
| Distribution | Extension opt-in and publisher review are real barriers; this prototype is not a high-coverage election-site repair. |

## Future protocol
Generalize this to a voluntary decentralized Rescue Manifest Registry with short-lived attestations, owner-authorized evidence, cross-device opt-in resolvers, multi-host mirrors, tamper-evident provenance, revocation, cache expiration, and external validation. Do not let unverified third parties redirect legitimate brand sites or user financial traffic.

## Immediate restoration gate
To fix `voteroman.com` for **everyone** without a browser extension, the domain controller still must authorize GoDaddy forwarding, DNS delegation, or an equivalent existing-host change. The shortest prepared legitimate route is in `campaign-recovery/roman-2026/RECOVERY.md`. Do not contact Paola, Roman, or the registrar on the user's behalf.

## Isolated Chromium verification

The GitHub Actions proof installs a dedicated Playwright-bundled Chromium in the runner, opens a disposable browser profile, and exercises **disabled at install → explicit checkbox and click → apex/www browser redirect → donation exclusion → disabled again**. All tested public host responses are intercepted by mocks, so no production campaign server or payments are contacted during this test. The extension background worker exists only to expose an ephemeral extension ID in that isolated browser; it contains no listeners, timers, fetches, or redirect activation. Running unit tests alone is no longer sufficient for the CI release gate. This does **not** distribute/install the extension on any user's device or fix the original site globally.
