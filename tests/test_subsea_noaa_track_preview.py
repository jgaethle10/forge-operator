"""Offline safety checks for raw NOAA source-track review, not 3D reconstruction."""
import importlib.util
from pathlib import Path
import unittest

script = Path(__file__).resolve().parents[1] / "scripts" / "prepare-noaa-ex2306-track-review.py"
spec = importlib.util.spec_from_file_location("noaa_raw_track_preview", script)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

HEADER = "DATE,TIME,UNIXTIME,DEPTH,ALT,LAT_DD,LON_DD\n"


class TrackPreviewTests(unittest.TestCase):
    def test_preserves_numeric_source_observations_with_no_3d_claim(self):
        csv = HEADER + (
            "2023-08-25,18:30:00,1692988200,-4260,2,56.9,-149.5\n"
            "2023-08-25,18:30:01,1692988201,-4261,2,56.91,-149.51\n"
        )
        data = mod.make_preview(csv, "EX2306_DIVE02_RovTrack1Hz.csv", end=1692988201)
        self.assertEqual(data["schema"], "evercraft.subsea.raw_track_clip.v1")
        self.assertEqual(data["position_rows"], 2)
        self.assertEqual(data["depth_rows"], 2)
        self.assertEqual(data["points"][0]["depth_source_signed"], -4260)
        self.assertEqual(data["points"][0]["lon_dd_observed"], -149.5)
        self.assertEqual(data["clip_start_utc"], "2023-08-25T18:30:00Z")
        self.assertFalse(data["certified_underwater_position"])
        self.assertFalse(data["surveyed_site_geometry"])
        self.assertIn("surveyed_3d_reconstruction", data["forbidden_uses"])
        self.assertIn("UNVERIFIED", data["video_alignment"])

    def test_missing_seconds_and_partial_position_remain_gaps(self):
        csv = HEADER + (
            "2023-08-25,18:30:00,1692988200,-4210,3,56.9,-149.5\n"
            "2023-08-25,18:30:02,1692988202,-4211,3,,-149.51\n"
        )
        data = mod.make_preview(csv, "track.csv", end=1692988202)
        self.assertEqual(data["source_rows_in_clip"], 2)
        self.assertEqual(data["position_rows"], 1)
        self.assertEqual(data["depth_rows"], 2)
        self.assertIsNone(data["points"][1]["depth_source_signed"])
        self.assertIsNone(data["points"][1]["lat_dd_observed"])
        self.assertIsNone(data["points"][2]["lon_dd_observed"])
        self.assertEqual(data["points"][2]["depth_source_signed"], -4211)

    def test_bad_geographic_fixes_are_not_plotted(self):
        csv = HEADER + (
            "a,b,1692988200,-12,1,91,-149.5\n"
            "a,b,1692988201,-11,1,56.9,200\n"
        )
        data = mod.make_preview(csv, "track.csv", end=1692988201)
        self.assertEqual(data["position_rows"], 0)
        self.assertEqual(data["depth_rows"], 2)

    def test_duplicates_refused_not_silently_overwritten(self):
        csv = HEADER + (
            "a,b,1692988200,-42,1,56.9,-149.5\n"
            "a,b,1692988200,-43,1,57.0,-150.0\n"
        )
        with self.assertRaisesRegex(ValueError, "Duplicate second"):
            mod.make_preview(csv, "track.csv", end=1692988201)

    def test_invalid_columns_and_oversized_windows_refused(self):
        with self.assertRaisesRegex(ValueError, "Missing required"):
            mod.make_preview("UNIXTIME,DEPTH\n1692988200,-3\n", "bad.csv")
        with self.assertRaisesRegex(ValueError, "oversized"):
            mod.make_preview(HEADER, "empty.csv", end=mod.CLIP_START+901)

    def test_wrong_source_archive_digest_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "SHA256 mismatch"):
            mod.extract_track(b"fake-ZIP-bytes")

    def test_observed_zero_not_treated_as_missing(self):
        csv = HEADER + "a,b,1692988200,0,0,0,0\n"
        data = mod.make_preview(csv, "track.csv", end=1692988200)
        self.assertEqual(data["depth_rows"], 1)
        self.assertEqual(data["position_rows"], 1)
        self.assertEqual(data["points"][0]["depth_source_signed"], 0)


if __name__ == "__main__":
    unittest.main()
