"""Offline tamper and lineage tests for the NOAA mobile evidence review."""
import importlib.util
from pathlib import Path
import unittest

script=Path(__file__).resolve().parents[1]/"scripts"/"verify-noaa-track-display.py"
spec=importlib.util.spec_from_file_location("subsea_verify_display",script)
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def fixture():
    points=[{
        "elapsed_s":i, "epoch_s_observed":1692988200+i,
        "lat_dd_observed":56.9200001234+i*.00000001,
        "lon_dd_observed":-149.5600009876+i*.00000001,
        "depth_source_signed":-1900.00051-i*.1,
    } for i in range(300)]
    full={"schema":"evercraft.subsea.raw_track_clip.v1",
          "status":"PROVISIONAL_NOAA_PROCESSED_1HZ_PRODUCT",
          "source_archive_sha256":mod.EXPECTED_SHA,
          "upstream_interpolation_and_padding":True,
          "source_rows_are_not_independent_raw_sensor_fixes":True,
          "source_rows_in_clip":300,"points":points}
    display={"schema":"evercraft.subsea.raw_track_preview_5s.v1",
             "status":"PROVISIONAL_PROCESSED_TRACK_DISPLAY",
             "source_archive_sha256":mod.EXPECTED_SHA,
             "processing_lineage":{
                 "source_processing_applied_before_evercraft":True,
                 "independent_fix_at_each_second":False,
                 "evercraft_added_interpolation":False,
                 "raw_sensor_positions":False,
                 "source_plan":"https://repository.library.noaa.gov/view/noaa/55994/noaa_55994_DS1.pdf"
             },
             "original_window_count":300,"preview_sample_count":61,
             "points":mod.sampled_rows(full)}
    return full,display


class VerificationTests(unittest.TestCase):
    def test_valid_processed_source_samples_have_no_certification_claim(self):
        full,display=fixture()
        report=mod.validate(full,display)
        self.assertEqual(report["compared_rows"],61)
        self.assertFalse(report["certified_position"])
        self.assertFalse(report["video_frame_sync"])
        self.assertTrue(report["upstream_interpolation_exists"])

    def test_detects_a_changed_coordinate(self):
        full,display=fixture()
        display["points"][20][2]+=0.000001
        with self.assertRaisesRegex(ValueError,"source value mismatch"):
            mod.validate(full,display)

    def test_detects_false_independent_fix_claim(self):
        full,display=fixture()
        display["processing_lineage"]["independent_fix_at_each_second"]=True
        with self.assertRaisesRegex(ValueError,"processing chain"):
            mod.validate(full,display)

    def test_detects_padded_export_misrepresented_as_raw_source(self):
        full,display=fixture()
        full["upstream_interpolation_and_padding"]=False
        with self.assertRaisesRegex(ValueError,"upstream processing"):
            mod.validate(full,display)

    def test_detects_missing_timestamp(self):
        full,display=fixture()
        full["points"][42]["elapsed_s"]=43
        with self.assertRaisesRegex(ValueError,"timestamp"):
            mod.validate(full,display)

    def test_missing_fix_stays_missing_in_mobile_sample(self):
        full,display=fixture()
        full["points"][5]["lat_dd_observed"]=None
        full["points"][5]["lon_dd_observed"]=None
        display["points"]=mod.sampled_rows(full)
        self.assertIsNone(display["points"][1][1])
        self.assertIsNone(display["points"][1][2])
        self.assertEqual(mod.validate(full,display)["compared_rows"],61)


if __name__=="__main__":
    unittest.main()
