# Evercraft Clip: Meta Page connection diagnostics

**Surface:** Authenticated Evercraft Home, `/credentials.html` → Facebook Pages → **Check status** → select a sealed Page reference → **Check Clip connection**. The screen uses `POST /api/clip/facebook/diagnose` solely to request read-only provider GETs. It does not submit a post, upload media, grant a Page task, or send raw credentials to the browser.

The route requires the existing `home.identity.sessions.manage` authorization, selects only a `facebook-pages` credential from the private owned vault, and checks:

1. `GET /v26.0/{page-id}?fields=id,name`. The Page ID must equal the sealed credential's exact Page ID, and the returned name must align with an approved Evercraft/Systemia corporate Page. A foreign brand is held for review.
2. `GET /v26.0/{page-id}/published_posts?limit=1&fields=id`. Even an empty list can establish that the Page read is authorized. Post contents and all provider error strings are discarded.
3. The result is deliberately `read_only_verified_write_unverified` at best. A successful GET **never proves `pages_manage_posts` or the Page's `CREATE_CONTENT` task**. Meta must separately authorize those privileges.

If multiple sealed Page credentials exist, select a specific reference from the drop-down. Clip must never guess which Page to write to. The HTML client does not store tokens, and the JSON response includes neither access tokens nor raw Meta error bodies.

| Diagnostic | What to do next |
| --- | --- |
| `credential_vault_not_configured` / `credential_missing` | Restore the private Evercraft Home vault and seal a valid Page credential |
| `credential_selection_ambiguous` | Select the intended company Page credential explicitly |
| `page_identity_read_denied` with Meta code 190 | Renew the Page token using authorized Meta login and reseal it privately |
| `page_identity_mismatch` | Correct Page ID/credential pairing before attempting to publish |
| `page_brand_requires_review` | Confirm the Page is a permitted Evercraft/Systemia brand; do not cross-post to unrelated businesses |
| `page_content_read_denied` | Restore the necessary Page read permissions |
| `read_only_verified_write_unverified` | Verify Meta `pages_manage_posts`, related Page role/task, Passport authority, durable attempt store and a real provider publication receipt before enabling writes |

**This diagnostic is not a production-ready signal or a live publish permission check.** CI uses fake Page tokens and simulated Graph responses, never real Meta credentials or posts. A real launch requires a permitted company Page ID, active publisher credentials in the owned vault, signed or scoped Systemia authority, server-side durable idempotency, and verified post ID/permalink readback. Use an eligible new campaign release after reconciliation; never delete an ambiguous claim just to force a retry.
