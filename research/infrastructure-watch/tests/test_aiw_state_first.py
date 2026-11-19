"""Offline federal-state map integrity tests. No network, no customer data."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

FOLDER=Path(__file__).resolve().parents[1]/"engineering"
sys.path.insert(0,str(FOLDER))
def load(name):
    spec=importlib.util.spec_from_file_location(name,FOLDER/(name+".py"))
    mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);return mod

geometry=load("aiw_state_geometry")
app=load("aiw_state_first_gateway")


class StateFirstTests(unittest.TestCase):
    def test_converts_real_topology_form_without_inventing_state_polygons(self):
        ids=["53","06","36","11","02","15"]+[str(i).zfill(2) for i in range(100,145)]
        # Synthetic polygons test the conversion algorithm only, NOT geographic claims.
        ids=ids[:51]
        shape={
            "type":"Topology",
            "transform":{"scale":[0.5,0.5],"translate":[-124,40]},
            "objects":{"states":{"type":"GeometryCollection","geometries":[
                {"type":"Polygon","id":key,"properties":{"name":"Synthetic "+key},"arcs":[[0]]}
                for key in ids
            ]}},
            "arcs":[[[0,0],[2,0],[0,2],[-2,0],[0,-2]]]
        }
        # Ensure realistic two-digit FIPS in tests without changing type counts.
        shape["objects"]["states"]["geometries"]=[
            {**row,"id":("10"+str(i)) if i>=6 else row["id"]}
            for i,row in enumerate(shape["objects"]["states"]["geometries"])
        ]
        # Geometry schema requires two-digit FIPS; expected synthetic IDs should be two digit.
        shape["objects"]["states"]["geometries"]=[
            {**row,"id":str(i+1).zfill(2) if i>=6 else row["id"]}
            for i,row in enumerate(shape["objects"]["states"]["geometries"])
        ]
        # avoid collisions for the first six special FIPS entries
        existing={row["id"] for row in shape["objects"]["states"]["geometries"][:6]}
        available=[str(i).zfill(2) for i in range(1,100) if str(i).zfill(2) not in existing]
        for i,row in enumerate(shape["objects"]["states"]["geometries"][6:]):
            row["id"]=available[i]
        geo=geometry.make_geojson(shape)
        self.assertEqual(geo["type"],"FeatureCollection")
        self.assertEqual(len(geo["features"]),51)
        self.assertEqual(geo["features"][0]["geometry"]["coordinates"][0][0],[-124.0,40.0])
        self.assertEqual(geo["features"][0]["geometry"]["coordinates"][0][-1],[-124.0,40.0])

    def test_refuses_missing_or_misaligned_source_data(self):
        self.assertRaises(ValueError,geometry.make_geojson,{"type":"FeatureCollection"})
        original='const STATES='+json.dumps([
            {"name":"Washington","bridges":8619,"poor":403,"baseline":"2025"}
            for _ in range(50)
        ],separators=(",",":"))+';'
        summaries=app.summaries_from_original(original)
        self.assertEqual(summaries[0]["vintage"],2025)
        self.assertEqual(summaries[0]["name"],"Washington")
        original=original.replace('"baseline":"2025"','"baseline":"2026"',1)
        with self.assertRaises(ValueError):
            app.summaries_from_original(original)

    def test_no_mixed_2025_2026_claims_in_original_page(self):
        original=(Path(__file__).resolve().parents[3]/"public"/"infrastructure-watch"/"index.html").read_text()
        states=app.summaries_from_original(original)
        self.assertGreaterEqual(len(states),50)
        self.assertTrue(all(r["vintage"]==2025 for r in states))
        self.assertTrue(any(r["name"]=="Washington" for r in states))


if __name__=="__main__":
    unittest.main()
