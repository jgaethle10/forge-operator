#!/usr/bin/env python3
"""Private state-first UI on top of original national AIW + WA official evidence.

National summaries come from the existing public AIW source, not invented
numbers. Geography comes from a saved Census-derived state-boundary file.
The complete original national workbench is available at /advanced.
"""
import argparse
import json
from pathlib import Path
import re
from http.server import ThreadingHTTPServer
from aiw_national_private_gateway import make_handler, validate, verified_leaflet

def summaries_from_original(page):
    match=re.search(r"const STATES=(\[[^\n]*\]);",page)
    if not match:raise ValueError("Original AIW national 2025 source summaries not found")
    rows=json.loads(match.group(1))
    if not 48<=len(rows)<=70:raise ValueError("Unexpected national summary coverage")
    out=[]
    for row in rows:
        name=row.get("name")
        total=row.get("bridges");poor=row.get("poor")
        if (not isinstance(name,str) or type(total)!=int or type(poor)!=int
            or total<poor or poor<0 or row.get("baseline")!="2025"):
            raise ValueError("National bridge summaries require explicit dated FHWA records")
        out.append({"name":name,"bridges_2025":total,"poor_2025":poor,
                    "source":row.get("source"),"vintage":2025})
    return out


def build_handler(public,old_overlay,db,vendor,states_geojson,simple_html):
    original=(Path(public)/"index.html").read_text(encoding="utf8")
    summary=summaries_from_original(original)
    boundary=Path(states_geojson).read_bytes()
    geo=json.loads(boundary)
    feats=geo.get("features",[])
    if (geo.get("type")!="FeatureCollection" or len(feats)<50 or
        not any(f.get("properties",{}).get("name")=="Washington" for f in feats)):
        raise ValueError("U.S. state boundary coverage not verified")
    # Do not join names to guesses; state labels and metrics carry source vintage.
    names={f.get("properties",{}).get("name") for f in feats}
    missing=[s["name"] for s in summary if s["name"] not in names]
    if len(missing)>5:raise ValueError("Too many inventory summaries without boundary matches")
    original_handler=make_handler(public,old_overlay,db,vendor)
    simple=Path(simple_html).read_bytes()
    if b"/api/states" not in simple or b"/data/states.geojson" not in simple:
        raise ValueError("Simple UI lacks expected source-bound endpoints")

    class Handler(original_handler):
        def do_GET(self):
            from urllib.parse import urlsplit
            url=urlsplit(self.path)
            if url.path in ("/","/index.html") and not url.query:
                return self.reply(200,simple,"text/html; charset=utf-8")
            if url.path=="/advanced" and not url.query:
                # Original fully featured map, untouched.
                self.path="/"
                return super().do_GET()
            if url.path=="/api/states" and not url.query:
                return self.obj(200,{"scope":"national_state_summaries_FHWA_2025",
                                     "nationwide_2026_imported":False,
                                     "source":"Original Evercraft national evidence map: FHWA 2025",
                                     "states":summary,
                                     "washington_2026_deep_data_available":True})
            if url.path=="/data/states.geojson" and not url.query:
                return self.reply(200,boundary,"application/geo+json; charset=utf-8")
            if url.path=="/healthz" and not url.query:
                return self.obj(200,{"status":"ready","experience":"state_first_interactive",
                                     "national_2025_summaries":len(summary),
                                     "state_polygons":len(feats),
                                     "washington_2026_records":8619,
                                     "public_release_ready":False,
                                     "national_2026_complete":False})
            return super().do_GET()
    return Handler


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--national-dir",required=True)
    parser.add_argument("--overlay",required=True)
    parser.add_argument("--db",required=True)
    parser.add_argument("--leaflet-dir",required=True)
    parser.add_argument("--state-geojson",required=True)
    parser.add_argument("--simple-html",required=True)
    parser.add_argument("--port",type=int,default=8794)
    args=parser.parse_args()
    if not 1024<=args.port<=65535:parser.error("Invalid port")
    validate(args.db)
    verified_leaflet(args.leaflet_dir)
    handler=build_handler(args.national_dir,args.overlay,args.db,args.leaflet_dir,args.state_geojson,args.simple_html)
    server=ThreadingHTTPServer(("127.0.0.1",args.port),handler)
    print(f"Private state-first AIW on http://127.0.0.1:{args.port}",flush=True)
    server.serve_forever()


if __name__=="__main__":main()
