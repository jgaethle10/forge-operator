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

It prints only record counts, field names and value **types**, not actual buyer names, messages, contact addresses, payments or IDs. The first real NextGen probe has **not yet been executed** from this environment, so compatibility with the actual 8795 payload remains to be confirmed.