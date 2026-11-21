# Demand Command private API (engineering canary)

This is an **Evercraft-owned, Python-standard-library** API supporting the local Demand Command prototype. It is **not deployed to Penguin or NextGen** and it does **not** send email or DMs. There are no packages to install, external scripts, databases, paid endpoints or third-party hosting dependencies.

## Safety boundaries

- Listens on `127.0.0.1:8796` only. It refuses a non-loopback host. Access from another computer requires an Evercraft-operated authenticated reverse proxy with TLS and restricted routing, which is **not** provisioned here.
- Requires a 32+ character secret in `EVERCRAFT_DEMAND_TOKEN` (bearer authorization on all routes). Keep the secret outside GitHub, command history and HTTP logs. Rotate secrets when needed.
- Data is stored as a **plaintext SQLite file** with filesystem mode `0600`. It is not encrypted at rest, a production identity service, or suitable for confidential cross-device customer records yet. Use owned encrypted volume and approved retention rules before production.
- Does not auto-send, quote, charge, contact people, or mark a reported message as provider-verified. `outreach_reported` and `delivery_verified` are different events; verification receipts currently rely on trusted operators and need a provider verifier for production.
- The `verified` label is a reviewed assertion requiring source, source text, reviewer and review receipt. The server cannot independently establish that an external claim is true.
- Duplicate detection rejects the same business/domain + pain fingerprint, and `/contact-check` exposes suspected previous outreach. It is an advisory gate, **not** comprehensive cross-account deduplication.
- No `DELETE` route. Events form an append-only SHA-256-linked log. This is tamper-evident for event rows, not tamperproof against privileged database alteration.

## Port collision: Infrastructure Watch opened instead

On NextGen, `http://127.0.0.1:8796/` may already be assigned to an Infrastructure Watch or other local service, including one exposed through Windows/WSL localhost routing. **Do not kill or restart another Evercraft service just to make this port available.**

From the checked-out backend directory, choose a separate port, start the Demand API in its own terminal, and verify the response *on the same machine* before opening the browser:

```bash
git -C "$HOME/evercraft-demand-canary" pull --ff-only
cd "$HOME/evercraft-demand-canary/sites/demand-command/backend"
export EVERCRAFT_DEMAND_PORT=18896
export EVERCRAFT_DEMAND_DB="$HOME/.local/state/evercraft/demand-command.sqlite"
# Use your already configured private token if present. Otherwise create one for this session.
if [ -z "${EVERCRAFT_DEMAND_TOKEN:-}" ]; then
  export EVERCRAFT_DEMAND_TOKEN="$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')"
fi
printf 'Demand Command private browser token (never share it): %s\n' "$EVERCRAFT_DEMAND_TOKEN"
python3 server.py
```

In a **second** NextGen terminal (same Linux user/session), confirm the new socket and identity without printing the token. If the token was generated only in the first terminal, the second terminal does not inherit it; instead, confirm the public shell title below, or use an authenticated request from the first terminal before starting the server:

```bash
curl -fsS --max-time 3 http://127.0.0.1:18896/ | grep -o '<title>[^<]*</title>' | head -1
# Expected: <title>Evercraft Demand Command | Private Console</title>
```

Only after seeing that title, open **http://127.0.0.1:18896/** in your NextGen browser. If the Windows browser still opens another site on that port, report the server's `Demand Command API bound...` line and the curl title; do not change the infrastructure service. For authentication, paste the secret into the browser console only; do not include it in chats or screenshots. The local-only server does not send messages.

## Quick local canary

```bash
cd sites/demand-command/backend
export EVERCRAFT_DEMAND_TOKEN="$(python3 -c 'import secrets;print(secrets.token_urlsafe(48))')"
export EVERCRAFT_DEMAND_DB="$HOME/.local/state/evercraft/demand-command.sqlite"
python3 server.py
```

Open `http://127.0.0.1:8796/` on the same machine to use the API-backed private console. Enter the secret from the secure environment in the connection box. The UI stores the secret only in memory and does not persist records to localStorage. Do not publish the raw loopback server to the open internet.

From an **authorized local terminal**:

```bash
curl -sS -H "Authorization: Bearer $EVERCRAFT_DEMAND_TOKEN" http://127.0.0.1:8796/api/heartbeat
```

Never paste the generated secret into chat or a commit. Use a private `EnvironmentFile` for services. Run tests with `python3 -m unittest -v`.

## API

| Method | Route | Function |
|---|---|---|
| `GET` | `/` | Browser console shell, with no opportunity data until authenticated |
| `GET` | `/api/heartbeat` | Liveness, record count, due count, latest write |
| `GET` | `/api/opportunities` | All records with interaction timeline |
| `GET` | `/api/opportunities/:id` | One dossier |
| `POST` | `/api/opportunities` | Capture source-backed signal (no fabricated rows) |
| `PATCH` | `/api/opportunities/:id` | Edit record with integer `version` for lost-update protection |
| `GET` | `/api/opportunities/:id/contact-check` | Advisory earlier-outreach check; always `delivery_authorized:false` |
| `POST` | `/api/opportunities/:id/interactions` | Append manual/provider-receipt-supplied events |

Events: `research_note`, `outreach_reported`, `delivery_verified`, `buyer_replied`, `objection`, `followup`, `outcome`, `review`.

Example intake (provided for Systemia integration, but **not currently wired to Kaidance**):

```json
{
  "business": "Example Business",
  "buyer": "",
  "website": "https://example.org",
  "pain": "The owner's public message asks for an accessible booking workflow",
  "evidence": "signal",
  "source": "message-id-or-source-link",
  "sourceText": "Exact observed request, with attribution",
  "category": "unqualified",
  "status": "researching",
  "product": "Evercraft-owned custom implementation"
}
```

## Integration gates

1. Deploy the API as a **separate loopback-only canary** on NextGen (default 8796), without changing Revenue Desk on 8795 or Infrastructure Watch on 8787.
2. Add an Evercraft-owned signed ingress adapter from Systemia to `/api/opportunities`. Make repeated heartbeat payloads idempotent and attach source IDs.
3. Reconcile company/buyer/website identities and historical email threads *before* authorizing any outreach. Contacts already engaged (including warm conversations) must be blocked from accidental duplicate follow-ups.
4. Put a real authenticated UI and encrypted backing store in front of the service. Merge with Revenue Desk through a versioned adapter after inspecting its live schema. The current `index.html` remains a local-first UI, **not** a live API client.
5. Obtain a real service health receipt and private owned-origin URL before describing Demand Command as deployed.

## QA

`python3 -m unittest -v` covers authentication, verified evidence requirements, deduplication, optimistic concurrency, event logging and honest delivery state.

## Getting the bridge onto NextGen

The script is committed under `sites/demand-command/backend/revenue_desk_bridge.py`, **not** `/home/coach/revenue_desk_bridge.py`. Running `python3 revenue_desk_bridge.py` from `/home/coach` will fail with *No such file or directory*.

For a safe first inspection, use a separate shallow checkout of the integration branch. This leaves any existing `~/forge-operator` working tree and production services untouched:

```bash
git clone --depth 1 --single-branch --branch feature/demand-command-site-20261118 \
  https://github.com/jgaethle10/forge-operator.git \
  "$HOME/evercraft-demand-canary"
cd "$HOME/evercraft-demand-canary/sites/demand-command/backend"
python3 revenue_desk_bridge.py --inspect-schema
```

If `$HOME/evercraft-demand-canary` already exists, don't reclone over it; inspect its branch and working tree before updating. This invocation is **read-only** and attempts to inspect Revenue Desk at `127.0.0.1:8795`. If it reports *Connection refused*, that is a distinct finding: Revenue Desk isn't listening on that address/port in this WSL session. Do not start or restart services based solely on a port assumption. No tokens or buyer data should be pasted into chats.


## NextGen private source pulse (November 19, 2026, interface-only)

The confirmed local NextGen screenshot shows the **private console at `http://127.0.0.1:18896/`**, with the Demand API connected and **zero local Demand dossiers**. Zero dossiers does **not** mean Revenue Desk has zero source records. The previous aggregate reconciliation observed 16 source records; that historical snapshot is not a current claim about the live system.

This iteration adds:
- A separate **Revenue Desk · Live source pulse**, with source-record count, reported due-review count, reply claims requiring provider reconciliation, and original-source-evidence gaps.
- A concrete *Next review* instruction per source row, based only on the already-defined review-tier rules.
- Automatic **read-only source loading after login**, manual refresh, and five-minute checks **only while this authenticated page is open and visible**. This browser interval is *not* the Systemia heartbeat or a headless background job.
- A stale-data warning when local Revenue Desk at 8795 is unavailable. Source review does not import leads, send messages, claim Gmail delivery, or mutate the Revenue Desk.

To obtain the new interface on an existing NextGen engineering canary, with no API/service restart:

```bash
cd "$HOME/evercraft-demand-canary"
git status --short
git pull --ff-only
git log -1 --oneline
```

Run `git pull --ff-only` **only if the worktree is clean**. Then hard-refresh `http://127.0.0.1:18896/` and connect with the existing private token, if that service remains running. The server reads `console.html` from disk on each request, so a UI-only change requires no service restart. **Don't paste tokens or private source records into chat or GitHub.**

Acceptance: a separate source pulse appears; on successful source fetch it displays source counts and a sortable-by-existing-order review table, without changing the local dossier counters. If Revenue Desk is unavailable, the interface explicitly reports a failed source check instead of treating it as zero opportunities.

## Live source review panel (v8, private / read-only)

The existing authenticated console now includes **Revenue Desk · Live Source Review**. This reads current source records directly from loopback `127.0.0.1:8795` on each request instead of copying buyer data into the Demand SQLite database. It displays a prioritized review tier, business/buyer, recorded pain, source reference, exact source signal when available, prior outbound recipient/subject/body/channel, and evidence checks. The UI escapes source fields and holds the token only in memory.

Observed local aggregate receipt as of 2026-11-19:

- 16 source rows, all marked `sent`; 16 entries include recipient, subject, body and channel structure.
- Priority review tiers: 6 due with named buyers, 2 due needing buyer identification, 8 source-evidence review.
- No detected provider message ID, timestamp or delivery status **inside those stored sent entries**.
- No source-reported buyer replies, no original signal text, and no verified deliveries/payments in the observed Revenue Desk export. This does not prove no Gmail replies or deliveries occurred.

Run a local **engineering canary** only, in the existing NextGen checkout (no change to Revenue Desk):

```bash
cd "$HOME/evercraft-demand-canary/sites/demand-command/backend"
git -C "$HOME/evercraft-demand-canary" pull --ff-only
python3 -m unittest -v
umask 077
export EVERCRAFT_DEMAND_TOKEN="$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')"
export EVERCRAFT_DEMAND_DB="$HOME/.local/state/evercraft/demand-command.sqlite"
printf 'Copy into the browser only (never into chat): %s\n' "$EVERCRAFT_DEMAND_TOKEN"
python3 server.py
```

Then visit **http://127.0.0.1:8796/** on that same machine, connect with the token, and select **Load private source records**. Only the authenticated loopback API will return identifiable source data. The source endpoint `GET /api/revenue-desk-review` is read-only and does not send, update, import or approve outreach. **Never expose port 8796 to the public internet or copy the private console payload to GitHub/chat.**

Caution: the Demand API creates a local plaintext SQLite file even if no opportunities are imported. Do not use it for sensitive production data without an encrypted owned volume and access hardening. The source review endpoint does **not** populate that database.

## Revenue Desk reconciliation bridge (v5, not deployed)

`revenue_desk_bridge.py` has **no third-party dependencies** and reads only a local `127.0.0.1:8795/api/opportunities` endpoint, or an explicitly supplied JSON export. It never sends email, calls outside localhost or modifies Revenue Desk. Unknown data layouts, missing stable IDs, absent explicit pain descriptions and duplicate IDs are rejected for review.

Preview the live export first on NextGen (do not paste actual buyer data into a chat or a public GitHub issue):

```bash
cd ~/forge-operator/sites/demand-command/backend
python3 revenue_desk_bridge.py --receipt="$HOME/.local/state/evercraft/demand-command/revenue-desk-preview.json"
```

That is **dry-run only** and doesn't require the Demand API token. Use the preview report to check `eligible`, `needs_review`, `contact_history_flags`, and any `rejected` rows. Use a locally exported source when live schema has changed:

```bash
python3 revenue_desk_bridge.py --input-json=/path/to/private-revenue-desk-export.json
```

To import reviewed, eligible records into the separate private Demand API at 8796, with `EVERCRAFT_DEMAND_TOKEN` available **only in the process environment**, run:

```bash
python3 revenue_desk_bridge.py --apply --receipt="$HOME/.local/state/evercraft/demand-command/revenue-desk-apply.json"
```

This explicitly authorized action creates matching local dossiers only and **cannot send messages**. Records are imported as unverified signals, even when historical source data says verified. Historical `sent` / `replied` statuses become *reported outreach*, never provider-confirmed delivery. A second import skips existing source IDs; differing pain for an existing source ID is **not** silently rewritten. Conflicting business/pain fingerprints are skipped for reconciliation. A write can fail halfway through, leaving a truthful per-record result; rerun is idempotent for completed records. There is no automatic synchronization of edits or deletions.

The `.service.example` and `.timer.example` files define an optional read-only preview every five minutes, running on **Evercraft-owned NextGen** with `systemd --user` after paths and privileges are checked. They are **not** installed or enabled and do not connect Systemia automatically. Install only after verifying the running Revenue Desk service and owned environment paths. Leave the `--apply` operation manual until historical outreach and cross-channel identity reconciliation is approved.

The preview receipts contain source record identifiers for rejected rows, counts and import outcomes, **not full message bodies**. Protect the report directory and SQLite database. This is an integration canary; it is not proof of a live, continuously running production service.

If the live Revenue Desk export schema is unfamiliar, run this **privacy-preserving inspector** before attempting a bridge run:

```bash
python3 revenue_desk_bridge.py --inspect-schema
```

It prints only counts, field names and value **types**, not actual buyer names, messages, contact addresses, payments or IDs. On **2026-11-19**, an operator-run read-only NextGen probe returned a top-level list of **16 records**, including `sent` as a list and `signal`, `kind`, `contact`, `permission`, `verified`, and `amount` as strings. The `compatible: true` result confirms *structural* compatibility only. No real buyer values were transmitted in that probe.

v6 now recognizes `sent` history without treating it as provider delivery, carries `signal` into source text, and preserves original `kind` and operational context as source-reported, unverified information. No row was imported or contacted by this schema inspection.

**NextGen next step, dry-run only:**

```bash
git -C "$HOME/evercraft-demand-canary" pull --ff-only
cd "$HOME/evercraft-demand-canary/sites/demand-command/backend"
python3 -m unittest -v
python3 revenue_desk_bridge.py --receipt="$HOME/.local/state/evercraft/demand-command/revenue-desk-preview.json"
```

The receipt contains only row numbers/rejection reasons and counts; it is written with owner-only permissions. Share only the printed summary, not the raw `/api/opportunities` JSON. **Do not run `--apply` yet**: first review eligibility, historical outreach, source evidence and cross-channel deduplication.

## Privacy-safe historical-contact triage (v7)

The first NextGen dry-run on **2026-11-19** reported **16 source rows, 16 structurally importable rows, 0 schema rejections, and 16 prior-contact flags**. This is *not* proof that 16 providers delivered messages, that 16 buyers are qualified, or that any revenue arrived. All 16 need correspondence reconciliation before fresh outreach.

The separate `revenue_desk_triage.py` tool produces an **aggregate-only** report of stage counts, prior-send-entry counts, reported buyer replies and objections, due follow-ups, source context, possible repeat business names, and unverified commercial/payment fields. It intentionally emits **no business names, buyer identities, contact details, message text, source IDs or payment references**.

Run the safe inspection in the **existing** NextGen canary directory:

```bash
git -C "$HOME/evercraft-demand-canary" pull --ff-only
cd "$HOME/evercraft-demand-canary/sites/demand-command/backend"
python3 -m unittest -v
python3 revenue_desk_triage.py \
  --receipt="$HOME/.local/state/evercraft/demand-command/revenue-desk-triage.json"
```

The tool reads the existing loopback Revenue Desk service on port 8795. It creates an owner-readable summary receipt but does **not** import opportunities, start a service, send messages, modify the Revenue Desk, or confirm historical delivery or payment. The stage labels are allowlisted; unknown raw status values are grouped as `other_or_empty` to avoid exposing arbitrary source text in the report.

Inspect aggregate output before allowing any `--apply` import. A safe future follow-up workflow must reconcile provider correspondence and source verification per person before any new outbound attempt. This canary is not live Systemia scheduling.


## v7 contact-evidence review queue (2026-11-19)

The first *real* NextGen dry run identified **16/16 structurally eligible records**, **16/16 marked sent**, **one reported `sent` entry per record**, no recorded buyer replies or objections, **6 named buyers**, **16 contact fields**, and **16 source references**. Only **10 follow-ups were reported as due by the initial UTC-based triage**, not validated against actual provider delivery or local Pacific business dates. The triage default now uses `America/Los_Angeles`; rerun to get the correct local-day count.

**Do not assume any of these were actually delivered or that every recipient may be contacted again.** Stage `sent`, contact detail, and a historical sent-list element are source claims, not independent delivery, permission, reply, or payment receipts.

The new `revenue_desk_action_queue.py` is a **read-only**, local-only review tool. It emits anonymized row **ordinals**, classifications, missing-evidence checks and structural indicators for reported `sent` entries. Even if a sent entry contains a provider ID/status, this proves only that the source claims such a field, **not** that the provider validated it. The output intentionally excludes contact values, source IDs, buyer names and message content. Ordinals are not stable IDs across reordered source lists.

Run on NextGen from this backend directory:

```bash
git pull --ff-only
python3 -m unittest -v
python3 revenue_desk_action_queue.py \
  --receipt="$HOME/.local/state/evercraft/demand-command/action-queue-local.json" \
  | python3 -c 'import sys,json;d=json.load(sys.stdin);print(json.dumps({k:d[k] for k in ("as_of_local_date","source_rows","tier_counts","sent_structure_counts","outreach_approved","delivery_verified","payment_verified")},indent=2))'
```

The full local receipt is owner-only and contains no names or contact fields. Do not paste raw Revenue Desk API JSON into chat/GitHub. Human review should occur against the existing private Revenue Desk records, including original source messages and outbound provider history. The queue cannot authorize sends, promises, quoting or payment claims. Nothing is synchronized to Demand API until review is complete.

