#!/usr/bin/env python3
"""Read-only NextGen Revenue Desk shadow review. Never grants contact authority."""
import argparse
import datetime as dt
import json
import pathlib
import re
import sqlite3
import sys
import tempfile
import unicodedata
from urllib.parse import urlsplit

SCHEMA = "evercraft.findmypart.desk-shadow-review.v1"
FIELDS = ("business", "buyer", "contact", "source", "external_id")
KEY = re.compile(r"findmypart:shop:[a-z0-9-]{1,80}\Z")
DOMAIN = re.compile(r"(?:[a-z0-9-]+\.)+[a-z]{2,63}\Z")
MAX_ROWS = 10000

def norm(value):
    return re.sub(r"[^a-z0-9]", "", unicodedata.normalize("NFKC", value).casefold())

def leaves(value, depth=0):
    if depth > 8:
        raise ValueError("nested_body_limit")
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for item in value.values():
            yield from leaves(item, depth+1)
    elif isinstance(value, list):
        for item in value:
            yield from leaves(item, depth+1)

def host(value):
    value = value.strip().lower()
    try:
        if "@" in value and " " not in value and "://" not in value:
            value = value.rsplit("@", 1)[1]
        else:
            u = urlsplit(value if "://" in value else "//"+value)
            if u.username or u.password:
                return ""
            value = u.hostname or ""
        value = value.removeprefix("www.")
        return value if DOMAIN.fullmatch(value) else ""
    except ValueError:
        return ""

def object_body(raw):
    if not isinstance(raw, str) or len(raw) > 1000000:
        raise ValueError("body_limit")
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise ValueError("body_not_object")
    return value

def parse_candidates(rows):
    if not isinstance(rows, list) or not 1 <= len(rows) <= 6:
        raise ValueError("candidate_count")
    seen = set()
    for row in rows:
        if not isinstance(row, dict) or set(row) != {"work_key","business_name","source_url"}:
            raise ValueError("candidate_shape")
        k, name, url = (row[x] for x in ("work_key","business_name","source_url"))
        if not all(isinstance(v,str) for v in (k,name,url)) or not KEY.fullmatch(k) or k in seen or not 4 <= len(norm(name)) <= 150 or len(url)>1000:
            raise ValueError("candidate_identity")
        u = urlsplit(url)
        if u.scheme != "https" or u.username or u.password or u.fragment or not host(url):
            raise ValueError("candidate_source")
        seen.add(k)
        yield k, norm(name), host(url)

def review(db, rows):
    candidates = list(parse_candidates(rows))
    db = pathlib.Path(db)
    if not db.is_absolute() or db.resolve(strict=True) != db or not db.is_file():
        raise ValueError("database_path")
    with sqlite3.connect(db.as_uri()+"?mode=ro", uri=True) as conn:
        conn.execute("PRAGMA query_only=ON")
        conn.execute("BEGIN")
        for table, expected in (("opportunities", {"id","external_id","body"}), ("sent", {"id","opportunity_id","body","recorded_at"})):
            if conn.execute("SELECT type FROM sqlite_master WHERE name=?", (table,)).fetchone() != ("table",):
                raise ValueError("database_schema")
            if {r[1] for r in conn.execute("PRAGMA table_info("+table+")")} != expected:
                raise ValueError("database_schema")
        opp = conn.execute("SELECT id,external_id,body FROM opportunities LIMIT ?", (MAX_ROWS+1,)).fetchall()
        sent = conn.execute("SELECT opportunity_id,body FROM sent LIMIT ?", (MAX_ROWS+1,)).fetchall()
        if max(len(opp),len(sent)) > MAX_ROWS:
            raise ValueError("database_capacity")
        opportunities = []
        for identifier, external_id, raw in opp:
            body = object_body(raw)
            identities = list(leaves([external_id]+[body.get(f) for f in FIELDS]))
            opportunities.append((identifier, identities))
        history = [(identifier,list(leaves(object_body(raw).get("recipient")))) for identifier,raw in sent]
    result = []
    for key,name,domain in candidates:
        def match(values):
            return any(norm(v)==name or host(v)==domain for v in values)
        ids = {identifier for identifier, identities in opportunities if match(identities)}
        prior = sum(identifier in ids or match(recipients) for identifier,recipients in history)
        result.append({"work_key":key,"opportunity_matches":len(ids),"sent_matches":prior,
            "state":"hold_existing_desk_history_review" if prior or ids else "no_desk_match_not_clearance",
            "contact_clearance":False,"outreach_authorized":False})
    return {"schema":SCHEMA,"observed_at":dt.datetime.now(dt.timezone.utc).isoformat(),
        "state":"desk_shadow_review_completed","opportunities":len(opp),"sent_records":len(sent),
        "candidates":result,"candidate_input_authority":"operator_supplied_unverified",
        "gmail_history_verified":False,"interaction_ledger_verified":False,"contact_clearance":False,
        "outreach_authorized":False,"production_modified":False,"private_customer_rows_exported":0}

def self_test():
    rows=[{"work_key":"findmypart:shop:example","business_name":"Example Repair","source_url":"https://example.com/parts"},
          {"work_key":"findmypart:shop:other","business_name":"Other Repair","source_url":"https://other.example/"}]
    with tempfile.TemporaryDirectory() as temp:
        db=pathlib.Path(temp)/"desk.sqlite3"
        with sqlite3.connect(db) as c:
            c.execute("CREATE TABLE opportunities(id INTEGER,external_id TEXT,body TEXT)")
            c.execute("CREATE TABLE sent(id INTEGER,opportunity_id INTEGER,body TEXT,recorded_at TEXT)")
            c.execute("INSERT INTO opportunities VALUES(1,'x',?)",(json.dumps({"business":"Example Repair","draft":"Other Repair","contact":{"email":"buyer@example.com"}}),))
            c.execute("INSERT INTO sent VALUES(1,1,?,'x')",(json.dumps({"recipient":"person@different.example"}),))
        before=db.read_bytes()
        report=review(db,rows)
        assert report["candidates"][0]["sent_matches"]==1
        assert report["candidates"][1]["opportunity_matches"]==0
        assert all(not r["contact_clearance"] for r in report["candidates"])
        assert "buyer@" not in json.dumps(report) and db.read_bytes()==before
        try:
            review(db,rows+rows)
        except ValueError:
            pass
        else:
            raise AssertionError("duplicate accepted")
        with sqlite3.connect(db) as c:
            c.execute("INSERT INTO sent VALUES(2,1,'invalid','x')")
        try:
            review(db,rows)
        except ValueError:
            pass
        else:
            raise AssertionError("invalid body accepted")
    print(json.dumps({"self_test":"passed","synthetic_only":True}))

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--db",type=pathlib.Path)
    p.add_argument("--self-test",action="store_true")
    args=p.parse_args()
    if args.self_test:
        self_test()
        return
    try:
        raw=sys.stdin.read(65537)
        if len(raw)>65536 or args.db is None:
            raise ValueError("input_limit")
        print(json.dumps(review(args.db,json.loads(raw)),indent=2))
    except (ValueError,OSError,sqlite3.Error,RecursionError):
        print(json.dumps({"schema":SCHEMA,"state":"hold_invalid_or_unavailable_input","contact_clearance":False,"outreach_authorized":False}))
        sys.exit(1)

if __name__=="__main__":
    main()
