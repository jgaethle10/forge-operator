#!/usr/bin/env python3
"""Evercraft AIW private national-map host with owned Washington 2026 depth.

Serves the original U.S. infrastructure page unchanged on disk, injecting one
opt-in drill-down script into the PRIVATE response. Bridges are backed by the
separate independently verified 2026 WA index, and the source-reported
out-of-state coordinate is excluded from mapped queries. Never public.
"""
import argparse
from contextlib import closing
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import sqlite3
from urllib.parse import urlsplit, parse_qs

EXPECTED_HASH="c97fb57339f8f7bd9ae82cb807814443fb7cd8bb9fb99c45adc74f2ae3912c79"
CONDITIONS={"P","F","G"}
MAX_PINS=350


def connect(db):
    conn=sqlite3.connect(f"file:{Path(db).resolve().as_posix()}?mode=ro&immutable=1",uri=True)
    conn.row_factory=sqlite3.Row
    conn.execute("PRAGMA query_only=ON")
    return conn


def validate(db):
    with closing(connect(db)) as connection:
        count=connection.execute("SELECT COUNT(*) FROM bridges").fetchone()[0]
        classified=dict(connection.execute(
            "SELECT condition,COUNT(*) FROM bridges GROUP BY condition"))
        anomalies=connection.execute("SELECT COUNT(*) FROM bridges WHERE coordinate_quality='review_outside_wa_bbox'").fetchone()[0]
        md={r["key"]:json.loads(r["value"]) for r in connection.execute("SELECT key,value FROM metadata")}
    if (count!=8619 or classified!={"G":4298,"F":3918,"P":403} or anomalies!=1
        or md.get("source_sha256")!=EXPECTED_HASH or md.get("scope")!="WA_only_not_national"
        or md.get("emergency_feed") is not False):
        raise ValueError("Owned WA index failed immutable-source/evidence validation")


def single_query(query, allowed):
    params=parse_qs(query,keep_blank_values=True,strict_parsing=True,max_num_fields=8) if query else {}
    if set(params)-allowed or any(len(v)!=1 for v in params.values()):
        raise ValueError("Unexpected or repeated query parameter")
    return {k:v[0] for k,v in params.items()}


def filtered_query(connection, args, viewport=False):
    condition=args.get("condition")
    if condition not in (None,"") and condition not in CONDITIONS:
        raise ValueError("Invalid condition")
    county=args.get("county")
    if county is not None and (not county.isdigit() or len(county)>3):
        raise ValueError("Invalid county")
    where=["coordinate_quality != 'review_outside_wa_bbox'"]
    values=[]
    if condition:
        where.append("condition=?");values.append(condition)
    if county:
        where.append("county_code=?");values.append(str(int(county)))
    if viewport:
        bounds=[]
        for key in ("south","north","west","east"):
            try:
                n=float(args[key])
            except (KeyError,ValueError):
                raise ValueError("Invalid viewport")
            if not (-90<=n<=90 if key in ("south","north") else -180<=n<=180):
                raise ValueError("Invalid viewport range")
            bounds.append(n)
        south,north,west,east=bounds
        if south>=north or west>=east:
            raise ValueError("Invalid viewport order")
        where.extend(["latitude BETWEEN ? AND ?","longitude BETWEEN ? AND ?"])
        values.extend([south,north,west,east])
    return " WHERE "+" AND ".join(where),values


def make_handler(national_dir,overlay,db):
    national_dir=Path(national_dir).resolve()
    original=(national_dir/"index.html").read_bytes()
    script=Path(overlay).read_bytes()
    marker=b"</body>"
    if original.count(marker)!=1:
        raise ValueError("National map HTML needs exactly one body closing tag")
    page=original.replace(marker,b'<script src="./owned-wa26-drilldown.js" defer></script>'+marker)

    class Handler(BaseHTTPRequestHandler):
        def reply(self,status,payload,ctype):
            self.send_response(status)
            self.send_header("Content-Type",ctype)
            self.send_header("Content-Length",str(len(payload)))
            self.send_header("Cache-Control","no-store")
            self.send_header("X-Content-Type-Options","nosniff")
            self.send_header("X-Frame-Options","DENY")
            self.end_headers()
            self.wfile.write(payload)

        def obj(self,status,obj):
            self.reply(status,json.dumps(obj,allow_nan=False,separators=(",",":")).encode(),"application/json; charset=utf-8")

        def do_GET(self):
            url=urlsplit(self.path)
            if url.path in ("/","/index.html") and not url.query:
                return self.reply(200,page,"text/html; charset=utf-8")
            if url.path=="/owned-wa26-drilldown.js" and not url.query:
                return self.reply(200,script,"application/javascript; charset=utf-8")
            if url.path in ("/pnw-2026.html","/wa-2026.html","/dc-2026.html"):
                target=national_dir/url.path.lstrip("/")
                if target.exists() and target.is_file():
                    return self.reply(200,target.read_bytes(),"text/html; charset=utf-8")
                return self.obj(404,{"error":"not_found"})
            if url.path=="/healthz" and not url.query:
                return self.obj(200,{"status":"ready","national_map":"original_preserved","owned_wa_2026_records":8619,
                                     "public_release_ready":False,"national_2026_complete":False})
            if url.path=="/api/wa26/summary" and not url.query:
                return self.obj(200,{"scope":"WA_only_2026","records":8619,
                                     "conditions":{"G":4298,"F":3918,"P":403},
                                     "flagged_coordinate_count":1,"source_sha256":EXPECTED_HASH,
                                     "historical_condition_not_emergency":True,
                                     "national_2026_complete":False})
            if url.path not in ("/api/wa26/bridges","/api/wa26/viewport"):
                return self.obj(404,{"error":"not_found"})
            try:
                viewport=url.path.endswith("/viewport")
                if viewport:
                    args=single_query(url.query,{"condition","south","north","west","east"})
                else:
                    args=single_query(url.query,{"condition","county","limit","offset"})
                with closing(connect(db)) as conn:
                    where,params=filtered_query(conn,args,viewport=viewport)
                    total=conn.execute("SELECT COUNT(*) FROM bridges"+where,params).fetchone()[0]
                    if viewport:
                        complete=total<=MAX_PINS
                        limit=MAX_PINS if complete else 0
                        offset=0
                    else:
                        try:
                            limit=int(args.get("limit","20"))
                            offset=int(args.get("offset","0"))
                        except ValueError:
                            raise ValueError("Invalid pagination")
                        if not 1<=limit<=100 or not 0<=offset<=8619:
                            raise ValueError("Pagination out of range")
                        complete=True
                    items=[dict(r) for r in conn.execute(
                        "SELECT bridge_id,name,condition,county_code,latitude,longitude,coordinate_quality,inspection_entry_count"
                        " FROM bridges"+where+" ORDER BY bridge_id LIMIT ? OFFSET ?",params+[limit,offset])]
                return self.obj(200,{"scope":"WA_only_2026","total_matches":total,
                                     "complete":complete,"returned":len(items),
                                     "offset":offset,"bridges":items,
                                     "not_live_safety":True,"national_2026_complete":False})
            except (ValueError,sqlite3.Error) as e:
                return self.obj(400,{"error":"invalid_query_or_database"})

        def do_POST(self): return self.obj(405,{"error":"read_only"})
        do_PUT=do_POST
        do_PATCH=do_POST
        do_DELETE=do_POST
        def log_message(self,*_): pass
    return Handler


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--national-dir",required=True)
    p.add_argument("--overlay",required=True)
    p.add_argument("--db",required=True)
    p.add_argument("--port",type=int,default=8792)
    a=p.parse_args()
    if not 1024<=a.port<=65535: p.error("Invalid port")
    validate(a.db)
    cls=make_handler(a.national_dir,a.overlay,a.db)
    server=ThreadingHTTPServer(("127.0.0.1",a.port),cls)
    print(f"Private original U.S. map + verified WA depth at http://127.0.0.1:{a.port}",flush=True)
    server.serve_forever()


if __name__=="__main__":main()
