#!/usr/bin/env python3
"""Generate an offline, local-only recall observatory from a verified receipt."""
import argparse
import datetime as dt
import html
import json
import os
from pathlib import Path
import re
import tempfile
from collect_fda import sha, encoded, write_once, collect

HEX = re.compile(r"^[a-f0-9]{64}$")

def verified(root, folder, digest):
    if not isinstance(digest, str) or not HEX.fullmatch(digest):
        raise ValueError("invalid evidence digest")
    path = root / folder / (digest + ".json")
    data = path.read_bytes()
    if sha(data) != digest:
        raise ValueError("evidence hash mismatch: " + folder)
    return json.loads(data)

def load(root, digest):
    receipt = verified(root, "receipts", digest)
    if receipt.get("mission") != "FOOD-TRANSPARENCY-001":
        raise ValueError("wrong mission")
    if receipt.get("status") not in ("collection_success", "collection_review_required"):
        raise ValueError("unusable collection")
    raw = verified(root, "raw", receipt["raw_sha256"])
    doc = verified(root, "normalized", receipt["normalized_sha256"])
    rows, review = doc["records"], doc["review_required"]
    if (doc["source_sha256"] != receipt["raw_sha256"] or
        len(rows) != receipt["identified_records"] or
        len(review) != receipt["review_required_records"] or
        len(rows) + len(review) != receipt["records"] or
        len(raw["results"]) != receipt["records"]):
        raise ValueError("inconsistent evidence")
    for row in rows + review:
        idx = row["source_row_index"]
        if type(idx) is not int or not 0 <= idx < len(raw["results"]):
            raise ValueError("invalid row locator")
        if sha(encoded(raw["results"][idx])) != row["source_row_sha256"]:
            raise ValueError("row evidence mismatch")
    if sorted(row["source_row_index"] for row in rows + review) != list(range(len(raw["results"]))):
        raise ValueError("duplicate or missing row locator")
    return receipt, rows, review

def esc(value):
    if value is None or value == "":
        return "Not provided"
    return html.escape(str(value), quote=True)

def card(row):
    fields = [("Firm", "recalling_firm"), ("FDA classification", "classification"),
              ("FDA record status", "status"), ("Recall number", "recall_number"),
              ("Report date (FDA)", "report_date"), ("Reason", "reason_for_recall"),
              ("Affected codes / lots", "code_info"), ("Distribution", "distribution_pattern")]
    details = "".join("<dt>" + label + "</dt><dd>" + esc(row.get(key)) + "</dd>" for label, key in fields)
    return ('<article class="record"><div class="tag">' + esc(row.get("classification")) +
            '</div><h2>' + esc(row.get("product_description")) +
            '</h2><dl>' + details + '</dl><details><summary>Evidence locator</summary><p>Source row ' +
            esc(row["source_row_index"]) + '<br><code>' + esc(row["source_row_sha256"]) +
            '</code></p></details></article>')

def render(receipt, rows, review, digest):
    classes = sorted({str(row["classification"]) for row in rows if row.get("classification")})
    options = "".join('<option value="' + esc(c) + '">' + esc(c) + '</option>' for c in classes)
    cards = "".join(card(row) for row in rows)
    review_rows = "".join('<li>Source row ' + esc(r["source_row_index"]) + ' · ' +
                          esc(r.get("product_description")) + ' · Identifier unresolved</li>' for r in review)
    return """<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>American Food Transparency | Evercraft</title>
<style>
:root{color-scheme:dark;--ink:#edf1e9;--muted:#aeb9af;--line:#34463e;--accent:#dbb773}
*{box-sizing:border-box}body{margin:0;background:#101b17;color:var(--ink);font:16px/1.6 system-ui,sans-serif}
main{max-width:1200px;margin:auto;padding:clamp(18px,4vw,56px)}header{border-bottom:1px solid var(--line);padding-bottom:30px}
.kicker,.tag{font-size:.75rem;letter-spacing:.13em;text-transform:uppercase;color:var(--accent)}
h1{font:clamp(2.5rem,7vw,5.2rem)/1.03 Georgia,serif;max-width:850px;margin:.25em 0}
h2{font:1.4rem/1.25 Georgia,serif;overflow-wrap:anywhere}p{color:var(--muted)}
.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:12px;margin:24px 0}
.metric,.record,aside{background:#192923;border:1px solid var(--line);border-radius:14px;padding:20px}
.metric strong{display:block;font:2rem Georgia,serif;color:var(--accent)}
.controls{display:flex;flex-wrap:wrap;gap:12px;margin:30px 0 15px}label{display:flex;flex-direction:column;gap:4px;flex:1;min-width:180px}
input,select{font:inherit;background:#0e1915;color:var(--ink);border:1px solid #668274;padding:12px;border-radius:8px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));gap:14px}
dl{margin:0}dt{font-size:.75rem;color:var(--muted);margin-top:12px}dd{margin:0;overflow-wrap:anywhere}
code{overflow-wrap:anywhere;font-size:.8rem}a{color:var(--accent)}summary{cursor:pointer;color:var(--accent)}
aside{margin-top:24px}article[hidden]{display:none}footer{margin-top:35px;color:var(--muted)}
</style></head><body><main><header><div class="kicker">Evercraft / Research preview / Publication held</div>
<h1>American Food Transparency</h1><p>Explore documented federal food recall records. Know what the evidence says, and what it cannot tell us.</p>
<p>Historical enforcement records are not a real-time safety determination. Check current agency notices and exact affected lots before taking action.</p>
<div class="metrics"><div class="metric"><strong>""" + esc(len(rows)) + """</strong>Identified in snapshot</div>
<div class="metric"><strong>""" + esc(len(review)) + """</strong>Unresolved identifiers</div>
<div class="metric"><strong>""" + esc(receipt.get("source_reported_total")) + """</strong>Source-reported total (not collected)</div>
<div class="metric"><strong style="font-size:1.35rem">""" + esc(receipt.get("source_last_updated")) + """</strong>Source last updated</div></div>
<p>Retrieved: """ + esc(receipt.get("retrieved_at_utc")) + """ · One page, not national coverage. <a href="https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts">FDA current notices</a> · <a href="https://open.fda.gov/apis/food/enforcement/">Source documentation</a></p></header>
<section aria-label="Search recalls"><div class="controls"><label>Search records<input id="q" type="search" placeholder="Product, firm, ingredient, lot..." autocomplete="off"></label>
<label>FDA classification<select id="class"><option value="">All classifications</option>""" + options + """</select></label></div>
<p id="count" aria-live="polite"></p><div class="grid">""" + cards + """</div></section>
<aside><h2>Evidence review queue</h2><p>Unresolved identifiers are excluded from the searchable record set. They remain preserved for review.</p><ul>""" + review_rows + """</ul></aside>
<footer><details><summary>Snapshot provenance</summary><p>Receipt SHA-256 <code>""" + esc(digest) + """</code><br>Raw SHA-256 <code>""" + esc(receipt["raw_sha256"]) + """</code><br>Normalized SHA-256 <code>""" + esc(receipt["normalized_sha256"]) + """</code></p></details>
<p>Local prototype · No safety scores · No external scripts · Not publicly released.</p></footer></main>
<script>
const q=document.getElementById('q'), c=document.getElementById('class'), items=[...document.querySelectorAll('.record')];
function filter(){let n=0;for(const el of items){const match=el.textContent.toLowerCase().includes(q.value.trim().toLowerCase())&&(!c.value||el.querySelector('.tag').textContent===c.value);el.hidden=!match;if(match)n++;}document.getElementById('count').textContent=n+' matching identified records';}
q.addEventListener('input',filter);c.addEventListener('change',filter);filter();
</script></body></html>"""

def self_test():
    with tempfile.TemporaryDirectory() as d:
        root = Path(d)
        raw = encoded({"results":[{"recall_number":"TEST","product_description":"<script>alert(1)</script>","classification":"Class I"},{"product_description":"unresolved"}]})
        r = collect(root, raw, "fixture", "fixture")
        digest = sha(encoded(r))
        receipt, rows, review = load(root, digest)
        page = render(receipt, rows, review, digest)
        assert "&lt;script&gt;alert(1)&lt;/script&gt;" in page
        assert "<script>alert(1)</script>" not in page
        assert len(rows) == len(review) == 1
        (root / "raw" / (r["raw_sha256"] + ".json")).write_bytes(b"tampered")
        try:
            load(root, digest)
        except ValueError:
            pass
        else:
            raise AssertionError("tampered data accepted")
    print("FOOD_OBSERVATORY_SELF_TEST PASS")

def main():
    os.umask(0o077)
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--self-test", action="store_true")
    p.add_argument("--root", type=Path, default=Path(os.environ.get("XDG_STATE_HOME", Path.home() / ".local/state")) / "evercraft-food-transparency")
    p.add_argument("--normalized-sha")
    args = p.parse_args()
    if args.self_test:
        self_test()
        return
    if not args.normalized_sha or not HEX.fullmatch(args.normalized_sha):
        p.error("provide --normalized-sha")
    matches = []
    for path in (args.root / "receipts").glob("*.json"):
        r = verified(args.root, "receipts", path.stem)
        if r.get("normalized_sha256") == args.normalized_sha:
            matches.append((r["retrieved_at_utc"], path.stem))
    if not matches:
        raise ValueError("matching receipt not found")
    digest = max(matches)[1]
    r, rows, review = load(args.root, digest)
    page = render(r, rows, review, digest).encode()
    path = args.root / "preview" / digest / "index.html"
    write_once(path, page)
    print(json.dumps({"status":"local_preview_built","receipt_sha256":digest,"html_sha256":sha(page),"identified":len(rows),"review_required":len(review),"path":str(path),"publication":"held"}, indent=2))

if __name__ == "__main__":
    main()
