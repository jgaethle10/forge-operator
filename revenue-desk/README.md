# Evercraft Revenue Desk

A private pipeline for verified buyer demand, scoped offers, outreach history and follow-up. Source belongs in forge-operator. The Python standard library and SQLite run on NextGen with no external scripts, hosted database, email sender or third-party application runtime.

## NextGen

From the canonical checkout in Ubuntu/WSL, run:

```bash
python3 revenue-desk/server.py
```

Open [Revenue Desk](http://127.0.0.1:8795/) on NextGen. For persistent operation, register the same command with the existing NextGen Systemia service supervisor. Keep the loopback binding. The default database is `~/.local/state/evercraft-revenue-desk/desk.sqlite3`. Back it up with SQLite's online backup facilities and leave it outside the repo. The service assumes a trusted local machine and has no multi-user authentication.

## Systemia intake

Have the existing Revenue & Deadline Radar publish a local JSON array to the NextGen worker, then invoke:

```bash
python3 revenue-desk/server.py --ingest /absolute/path/to/systemia-batch.json
```

Use the same state path for intake and the running service. The producer should export records like this synthetic fixture:

```json
[
  {
    "external_id": "radar:source-id",
    "business": "Example Outfitters",
    "buyer": "",
    "pain": "Needs footage edited before its product launch",
    "source": "Original thread or buyer message reference",
    "signal": "Public request for editing help",
    "assumption": "Deadline and budget need confirmation",
    "kind": "Paid work"
  }
]
```

Use a stable, source-specific external ID so retries do not duplicate rows. Imports are transactional and start at New with verification and contact permission unset. A later import with the same ID preserves the desk record. The open dashboard refreshes every 30 seconds. Trigger intake from the existing Systemia worker after each completed radar run. This repository change defines the intake contract. It does not change the running radar or the NextGen supervisor.

## Daily use

Review Next up for due follow-ups, then qualified direct paid work. Record what the buyer actually said and add the verified facts, assumptions and unresolved signal separately. Confirm the named buyer, allowed contact path, specific business relevance and capability fit to qualify the record. Check delivery and pricing before quoting.

Build a first draft from the deal record and review it against the source. Send through the actual conversation channel when authorized and log the exact subject, body, recipient, date and channel as a sent record. The app only records outreach. Track the reply, objection, next follow-up and final outcome in the same deal. Proposed value is an estimate in USD.

For the first offer, the Day 1 ledger records a $50 pay-on-approval Fallen Studios Founding Commercial, subject to capacity. Public demand for local contractor work belongs in research unless a suitable buyer and contact path are confirmed. Keep personal lead data in the local database.
