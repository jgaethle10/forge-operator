# Evercraft Clip: first-party one-login Meta Page reconnection

## Status and boundaries

Source implementation only until an Evercraft-owned Meta app is configured on Penguin and a real owner completes the Meta authorization. This never contacts Base44, creates a post, enables Page publishing, or assumes prior integration tokens survived migration.

**Owned Home operator flow**

1. Sign into Evercraft Home with your Passport owner account.
2. Visit \`https://fabric.systemiacommandcenters.com/home/credentials.html?provider=facebook-pages\`.
3. Click **Connect Facebook once**. Home creates a private, one-use random OAuth state bound to the current Passport subject/session and redirects to Meta Login using only the approved Page permissions.
4. Meta returns a code to the exact configured \`/home/api/clip/facebook/oauth/callback\`. Because Home sessions have \`SameSite=Strict\`, the callback does NOT rely on receiving the session cookie during cross-origin navigation. Instead, it redeems the one-use state and keeps the resulting Page tokens privately in resident memory for at most 10 minutes.
5. **Click** the first-party "Return to Evercraft Connections" link, so the original Home session is available on same-site navigation. Then review the returned candidate Pages.
6. Explicitly select the approved Pages to seal. No Page is auto-selected, and no social posts or write flags are enabled. Unknown registry IDs and historical excluded brands are held.
7. Re-check each selected credential via **Check status** and **Check Clip connection** (read-only), then separately verify actual Meta publishing tasks and a provider post/readback before enabling Journal distribution.

## Meta app prerequisites

Use an **Evercraft-owned** Meta developer application with Facebook Login and appropriate approved permissions for Pages you manage. Exact permissions requested by the flow:
- \`pages_show_list\`
- \`pages_read_engagement\`
- \`pages_manage_posts\`

Each Page must also expose \`CREATE_CONTENT\` in its returned task list to be selectable. Login alone does not create app-review approval or Page roles.

The Meta app must register exactly this allowed redirect URI in its Facebook Login settings:

\`https://fabric.systemiacommandcenters.com/home/api/clip/facebook/oauth/callback\`

Only then configure the *private resident* \`/etc/evercraft/home.env\` (never GitHub or chat) with these key names:

\`\`\`ini
CLIP_META_APP_ID=<numeric Meta App ID>
CLIP_META_APP_SECRET_FILE=/var/lib/evercraft/home/private/meta-app-secret
CLIP_META_REDIRECT_URI=https://fabric.systemiacommandcenters.com/home/api/clip/facebook/oauth/callback
CLIP_META_GRAPH_VERSION=v27.0
\`\`\`

**Private one-command setup after the owner registers the Meta app:**

From the canonical `forge-operator` checkout on Penguin:

```bash
sudo bash scripts/configure-home-meta-app.sh YOUR_NUMERIC_META_APP_ID
```

The command privately prompts for the **App Secret with echo disabled**, writes it in an owned 0600 private file, preserves existing Home identity, Passport and Clip configuration, and restarts the service. Never paste the App Secret into ChatGPT or put it on a command line. Creating the Meta app and granting Facebook account access still requires the owner's consent.
Place the Meta app secret in the referenced file, readable by the Evercraft Home service user but not group/other (file mode 0600, private directory mode 0700). Do not put the secret value in \`home.env\`, git, CLI arguments, screenshots or chat. Do not print it in logs. Restart \`evercraft-home.service\` only after the private configuration is complete.

Config is intentionally *not* inserted by the repo installer: private Home settings survive release updates and must be verified for real authorization.

## Safety constraints

- First-party OAuth \`code\` flow with random 256-bit one-time state, short TTL, caller-bound owner session, no auto-POST, no Graph URL accepted from user input and no client access to Meta tokens.
- Provider requests use fixed \`graph.facebook.com\` HTTPS endpoints; pagination uses a bounded cursor rather than following provider-supplied URLs.
- Home keeps only eligible candidates returned by the current Meta account, never takes a Page ID or token from an arbitrary callback body.
- Exact historical Page IDs from the Oct 22 inventory are candidate allowlist, NOT authorization. The current Meta provider identity and \`CREATE_CONTENT\` task are required and the owner must explicitly select a Page.
- Historical hard exclusions (by BOTH Page ID and normalized name): Havenly Cleaning, Evercraft Property Services, R&B Chicken & Soul.
- The callback landing page does not echo Meta's code, access token, or error text.
- A status response returns Page identity and bounded tasks only, never access tokens or app secrets.
- Home vault stores each Page separately (\`evercraft-clip-page-<id>\` label); all Page publish flags stay off.
- State is resident-memory only. If Penguin restarts or the flow expires before the explicit selection, the owner needs to authorize again. This is deliberately fail-closed, not a claim of durable pending tokens.
- Read-only diagnostics do not prove write permissions, token renewal, live posting, Meta business review, or any Instagram/LinkedIn reconnection.

## Test

\`\`\`sh
node --test systemia/evercraft-home/meta-page-reconnect.test.mjs
node --test systemia/evercraft-home/facebook-page-credential-http.test.mjs
\`\`\`

Tests simulate Meta responses and assert Passport authorization, callback CSRF state, cross-site session behavior, duplicate prevention, hard exclusions, explicit selection, vault isolation, and no token leakage. They are *not* proof of a real Meta app or live Page connection.
