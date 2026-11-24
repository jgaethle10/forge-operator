"""Private, bounded VA Gravesite Locator canary. No public publishing."""
import argparse
import hashlib
import json
import os
import pathlib
import shutil
import sqlite3
import urllib.parse
import urllib.request

SOURCE = "https://www.data.va.gov/resource/3u66-fxug.json"
LICENSE = "https://creativecommons.org/publicdomain/zero/1.0/"
REFERENCES = [
    "https://www.data.va.gov/dataset/National-Cemetery-Administration-Gravesite-Locator/3u66-fxug",
    "https://catalog.data.gov/dataset/national-cemetery-administration-gravesite-locator-13d36",
]
FIELDS = ("decedent_id", "d_first_name", "d_mid_name", "d_last_name",
          "d_suffix", "d_birth_date", "d_death_date", "section_id",
          "row_num", "site_num", "cem_name", "city", "state", "zip")
LIMIT = 250

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise ValueError("redirect refused")

def fetch_page(cursor):
    query = {"$select": ",".join(FIELDS), "$order": "decedent_id ASC",
             "$limit": LIMIT, "$where": "decedent_id > " + str(cursor)}
    req = urllib.request.Request(SOURCE + "?" + urllib.parse.urlencode(query),
                                 headers={"Accept": "application/json"})
    with urllib.request.build_opener(NoRedirect()).open(req, timeout=25) as res:
        raw = res.read(2 * 1024 * 1024 + 1)
    if len(raw) > 2 * 1024 * 1024:
        raise ValueError("page exceeds byte budget")
    return raw

def import_page(db, fetcher=fetch_page):
    db.execute("BEGIN IMMEDIATE")
    try:
        cursor = db.execute("SELECT cursor FROM checkpoint WHERE id=1").fetchone()[0]
        raw = fetcher(cursor)
        rows = json.loads(raw)
        if not isinstance(rows, list) or len(rows) > LIMIT:
            raise ValueError("unexpected page shape")
        new_cursor = cursor
        for row in rows:
            if not isinstance(row, dict) or set(row) - set(FIELDS):
                raise ValueError("unexpected field")
            ident = str(row.get("decedent_id", ""))
            if not ident.isascii() or not ident.isdecimal() or len(ident) > 18:
                raise ValueError("invalid source identifier")
            number = int(ident)
            if number <= new_cursor:
                raise ValueError("nonmonotonic source identifiers")
            values = [row.get(k) for k in FIELDS[1:]]
            if any(v is not None and (not isinstance(v, str) or len(v)>500) for v in values):
                raise ValueError("invalid field value")
            db.execute("INSERT INTO burials VALUES (" + ",".join("?" for _ in FIELDS) + ")", [number,*values])
            new_cursor = number
        digest = hashlib.sha256(raw).hexdigest()
        db.execute("INSERT INTO receipts(cursor_before,cursor_after,rows,sha256) VALUES (?,?,?,?)",
                   (cursor,new_cursor,len(rows),digest))
        db.execute("UPDATE checkpoint SET cursor=? WHERE id=1",(new_cursor,))
        db.commit()
        return {"rows_imported":len(rows),"cursor_before":cursor,"cursor_after":new_cursor,
                "total":db.execute("SELECT count(*) FROM burials").fetchone()[0],
                "source":SOURCE,"license":LICENSE,"rights_references":REFERENCES,
                "source_data_as_of":"2022-11-08","sha256":digest,
                "coordinate_precision":"not_imported","public_release":False}
    except BaseException:
        db.rollback()
        raise

def initialize(db):
    db.execute("CREATE TABLE IF NOT EXISTS burials (decedent_id INTEGER PRIMARY KEY," +
               ",".join(k+" TEXT" for k in FIELDS[1:]) + ")")
    db.execute("CREATE INDEX IF NOT EXISTS burial_search ON burials(state,d_last_name COLLATE NOCASE,d_first_name COLLATE NOCASE)")
    db.execute("CREATE TABLE IF NOT EXISTS checkpoint(id INTEGER PRIMARY KEY CHECK(id=1),cursor INTEGER NOT NULL)")
    db.execute("INSERT OR IGNORE INTO checkpoint VALUES(1,-1)")
    db.execute("CREATE TABLE IF NOT EXISTS receipts(id INTEGER PRIMARY KEY,cursor_before INTEGER,cursor_after INTEGER,rows INTEGER,sha256 TEXT)")
    db.commit()

def self_test():
    db=sqlite3.connect(":memory:")
    initialize(db)
    a=import_page(db,lambda c: b'[{"decedent_id":"1","d_last_name":"Fixture"}]')
    assert a["total"]==1
    try:
        import_page(db,lambda c: b'[{"decedent_id":"2"},{"decedent_id":"1"}]')
    except ValueError:
        pass
    else:
        raise AssertionError("bad page accepted")
    assert db.execute("SELECT count(*) FROM burials").fetchone()[0]==1
    assert db.execute("SELECT cursor FROM checkpoint").fetchone()[0]==1
    assert import_page(db,lambda c: b'[{"decedent_id":"2"}]')["total"]==2
    print("PASS: transactional import, rollback, resume")

if __name__ == "__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--self-test",action="store_true")
    p.add_argument("--out",type=pathlib.Path)
    args=p.parse_args()
    if args.self_test:
        self_test()
    else:
        if not args.out or not args.out.is_absolute():
            p.error("absolute private --out required")
        os.umask(0o077)
        args.out.mkdir(mode=0o700,parents=True,exist_ok=True)
        if args.out.is_symlink() or args.out.stat().st_mode & 0o077:
            raise ValueError("private output required")
        if shutil.disk_usage(args.out).free < 100*1024*1024:
            raise ValueError("insufficient free space")
        target=args.out/"va-gravesite-canary.sqlite3"
        if target.is_symlink() or (target.exists() and target.stat().st_mode & 0o077):
            raise ValueError("unsafe database")
        with sqlite3.connect(target,timeout=5) as db:
            initialize(db)
            print(json.dumps(import_page(db),indent=2))
