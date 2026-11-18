"""Private, loopback-only Evercraft Revenue Desk and Systemia file intake."""
import argparse
import json
import sqlite3
from decimal import Decimal, InvalidOperation
from urllib.parse import urlsplit
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
STAGES = {"New", "Researching", "Draft ready", "Sent", "Replied", "Negotiating", "Won", "Lost"}
KINDS = {"Lead", "Paid work", "Product offer"}
FIELDS = """business buyer role contact pain source verified assumption signal product
offer subject draft status reply objection followup next_action outcome kind amount
permission relevance external_id accepted checkout paid_reference paid_amount""".split()


def normalize(data):
    if not isinstance(data, dict):
        raise ValueError("Expected an opportunity object.")
    record = {}
    for field in FIELDS:
        value = data.get(field, "")
        if not isinstance(value, str) or len(value) > 25000:
            raise ValueError(f"Invalid {field}.")
        record[field] = value.strip()
    if not record["business"] or not record["pain"]:
        raise ValueError("Business and pain point are required.")
    if record["status"] not in STAGES or record["kind"] not in KINDS:
        raise ValueError("Choose a valid stage and opportunity type.")
    if record["checkout"]:
        url = urlsplit(record["checkout"])
        if url.scheme != "https" or not url.hostname or url.username or url.password:
            raise ValueError("Enter an HTTPS checkout URL without embedded credentials.")
    if bool(record["paid_reference"]) != bool(record["paid_amount"]):
        raise ValueError("Payment requires both a provider receipt reference and the received amount.")
    if record["paid_amount"]:
        try:
            amount = Decimal(record["paid_amount"])
            if not amount.is_finite() or amount <= 0 or amount.as_tuple().exponent < -2:
                raise ValueError("Enter a positive received USD amount with up to two decimal places.")
        except InvalidOperation:
            raise ValueError("Invalid received amount.") from None
    return record


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--state", type=Path, default=Path.home() / ".local/state/evercraft-revenue-desk")
    parser.add_argument("--port", type=int, default=8795)
    parser.add_argument("--ingest", type=Path, help="Import a Systemia JSON array, then exit.")
    args = parser.parse_args()
    args.state.mkdir(mode=0o700, parents=True, exist_ok=True)

    def connect():
        return sqlite3.connect(args.state / "desk.sqlite3")

    with connect() as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS opportunities
            (id INTEGER PRIMARY KEY, external_id TEXT UNIQUE, body TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sent
            (id INTEGER PRIMARY KEY, opportunity_id INTEGER NOT NULL, body TEXT NOT NULL,
             recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
        """)

    if args.ingest:
        records = json.loads(args.ingest.read_text())
        if not isinstance(records, list):
            parser.error("Intake expects a JSON array.")
        with connect() as db:
            count = 0
            for entry in records:
                record = normalize({**entry, "status": "New", "permission": "", "verified": "",
                                    "kind": entry.get("kind", "Lead"), "accepted": "", "checkout": "",
                                    "paid_reference": "", "paid_amount": ""})
                if not record["external_id"] or not record["source"]:
                    raise ValueError("Intake requires external_id and source.")
                count += db.execute("INSERT OR IGNORE INTO opportunities(external_id, body) VALUES (?, ?)",
                                    (record["external_id"], json.dumps(record))).rowcount
        print(json.dumps({"inserted": count, "duplicates": len(records) - count}))
        return

    class Handler(BaseHTTPRequestHandler):
        def send(self, data, status=200, content_type="application/json"):
            body = data if isinstance(data, bytes) else json.dumps(data).encode()
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'")
            self.end_headers()
            self.wfile.write(body)

        def local_host(self):
            return self.headers.get("Host") in {f"127.0.0.1:{args.port}", f"localhost:{args.port}"}

        def do_GET(self):
            if not self.local_host():
                self.send({"error": "Loopback only."}, 403)
                return
            if self.path == "/api/opportunities":
                with connect() as db:
                    records = {}
                    for record_id, body in db.execute("SELECT id, body FROM opportunities ORDER BY id DESC"):
                        records[record_id] = {**json.loads(body), "id": record_id, "sent": []}
                    for record_id, body, date in db.execute("SELECT opportunity_id, body, recorded_at FROM sent ORDER BY id DESC"):
                        records[record_id]["sent"].append({**json.loads(body), "recorded": date})
                self.send(list(records.values()))
                return
            files = {"/": ("index.html", "text/html"), "/app.js": ("app.js", "text/javascript")}
            if self.path in files:
                name, content_type = files[self.path]
                self.send((ROOT / name).read_bytes(), content_type=content_type + "; charset=utf-8")
            else:
                self.send({"error": "Page not found."}, 404)

        def do_POST(self):
            if not self.local_host() or self.headers.get("Origin") != f"http://{self.headers.get('Host')}":
                self.send({"error": "Same-origin requests only."}, 403)
                return
            if self.path not in {"/api/opportunities", "/api/sent"}:
                self.send({"error": "Page not found."}, 404)
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= 2_000_000:
                    raise ValueError("Invalid request size.")
                data = json.loads(self.rfile.read(length))
                record_id = data.get("id")
                with connect() as db:
                    if self.path == "/api/sent":
                        row = db.execute("SELECT body FROM opportunities WHERE id = ?", (record_id,)).fetchone()
                        if not row:
                            raise ValueError("Save the opportunity first.")
                        record = json.loads(row[0])
                        message = {key: str(data.get(key, "")).strip() for key in ("recipient", "channel", "when", "subject", "message")}
                        if not all(message[key] for key in ("recipient", "channel", "when", "message")):
                            raise ValueError("Recipient, channel, date and exact message are required.")
                        db.execute("INSERT INTO sent(opportunity_id, body) VALUES (?, ?)", (record_id, json.dumps(message)))
                        if record["status"] in {"New", "Researching", "Draft ready"}:
                            record["status"] = "Sent"
                            db.execute("UPDATE opportunities SET body=? WHERE id=?", (json.dumps(record), record_id))
                    else:
                        record = normalize(data)
                        if record_id is None:
                            record["external_id"] = ""
                            record_id = db.execute("INSERT INTO opportunities(body) VALUES (?)", (json.dumps(record),)).lastrowid
                        else:
                            row = db.execute("SELECT external_id FROM opportunities WHERE id=?", (record_id,)).fetchone()
                            if not row:
                                raise ValueError("Opportunity no longer exists.")
                            record["external_id"] = row[0] or ""
                            db.execute("UPDATE opportunities SET body=? WHERE id=?", (json.dumps(record), record_id))
                self.send({"id": record_id})
            except (AttributeError, TypeError, ValueError) as error:
                self.send({"error": str(error)}, 400)

    print(f"Evercraft Revenue Desk: http://127.0.0.1:{args.port}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
