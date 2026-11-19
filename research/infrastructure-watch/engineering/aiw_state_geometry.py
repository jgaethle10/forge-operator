#!/usr/bin/env python3
"""Convert published U.S. Census-derived us-atlas TopoJSON to local GeoJSON.

No maps are fabricated. Geometry comes from us-atlas v3.0.1 states-10m.json.
The output is private owner-local static data with a source SHA receipt.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import tempfile

SOURCE="https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-10m.json"


def make_geojson(topology):
    if topology.get("type")!="Topology":
        raise ValueError("Expected published TopoJSON topology")
    geometries=topology.get("objects",{}).get("states",{}).get("geometries")
    arcs=topology.get("arcs")
    transform=topology.get("transform")
    if not isinstance(geometries,list) or not isinstance(arcs,list) or not isinstance(transform,dict):
        raise ValueError("Unrecognized published state boundaries")
    scale=transform.get("scale");translate=transform.get("translate")
    if not (isinstance(scale,list) and isinstance(translate,list) and len(scale)==2 and len(translate)==2):
        raise ValueError("Unrecognized coordinate transform")
    def arc(index):
        raw=arcs[index if index>=0 else ~index]
        x=y=0
        coords=[]
        for dx,dy in raw:
            x+=dx;y+=dy
            coords.append([round(x*scale[0]+translate[0],6),round(y*scale[1]+translate[1],6)])
        if index<0:coords.reverse()
        return coords
    def ring(indices):
        points=[]
        for idx in indices:
            segment=arc(idx)
            if not segment:continue
            points.extend(segment if not points else segment[1:])
        if not points or len(points)<4:
            raise ValueError("Invalid state boundary ring")
        if points[0]!=points[-1]:points.append(points[0])
        return points
    features=[]
    for g in geometries:
        fid=str(g.get("id","")).zfill(2)
        name=g.get("properties",{}).get("name")
        kind=g.get("type")
        if not fid.isdigit() or len(fid)!=2 or not isinstance(name,str):
            raise ValueError("State boundary has invalid identity")
        if kind=="Polygon":
            coords=[ring(a) for a in g["arcs"]]
        elif kind=="MultiPolygon":
            coords=[[ring(a) for a in polygon] for polygon in g["arcs"]]
        else:raise ValueError("Unsupported state geometry")
        features.append({"type":"Feature","id":fid,"properties":{"fips":fid,"name":name},
                         "geometry":{"type":kind,"coordinates":coords}})
    keys={f["id"] for f in features}
    if len(keys)!=len(features) or not (50<=len(features)<=65) or not {"53","06","36","11","02","15"}.issubset(keys):
        raise ValueError("Incomplete or duplicate national state geometry")
    return {"type":"FeatureCollection","name":"Census-derived us-atlas states-10m version 3.0.1",
            "source":SOURCE,"features":features}


def convert(source,destination):
    raw=Path(source).read_bytes()
    if len(raw)>1000000:raise ValueError("Boundary dataset exceeds expected size")
    obj=json.loads(raw)
    geo=make_geojson(obj)
    dest=Path(destination)
    if dest.exists():raise FileExistsError("Refusing to overwrite state geometry")
    dest.parent.mkdir(parents=True,exist_ok=True)
    fd,tmp=tempfile.mkstemp(prefix=".states-",dir=dest.parent)
    try:
        with os.fdopen(fd,"w",encoding="utf8") as f:
            json.dump(geo,f,separators=(",",":"),ensure_ascii=False)
        os.chmod(tmp,0o600)
        os.link(tmp,dest)
    finally:
        Path(tmp).unlink(missing_ok=True)
    return {"source":SOURCE,"source_sha256":hashlib.sha256(raw).hexdigest(),
            "feature_count":len(geo["features"]),
            "geojson":str(dest),"scope":"federal_cartography_not_infrastructure_evidence"}


if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--source",required=True)
    p.add_argument("--dest",required=True)
    args=p.parse_args()
    print(json.dumps(convert(args.source,args.dest),indent=2))
