"""Synthetic offline rights/geometry checks for the future KSS aerial kernel."""
import hashlib
import struct
import unittest
import zlib
import raster_registration as r


def synthetic_png(width=128, height=96):
    def chunk(tag, data):
        payload = tag + data
        return struct.pack(">I", len(data)) + payload + struct.pack(">I", zlib.crc32(payload) & 0xffffffff)
    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    pixels = b"".join(b"\x00" + b"\xee\xee\xee" * width for _ in range(height))
    return r.PNG_SIGNATURE + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(pixels)) + chunk(b"IEND", b"")


class AerialKernelTest(unittest.TestCase):
    def setUp(self):
        self.image = synthetic_png()
        self.raw = {
            "schema": r.SCHEMA, "site_id": "SITE-OWNED-SYNTHETIC",
            "pixel_width": 128, "pixel_height": 96,
            "expected_sha256": hashlib.sha256(self.image).hexdigest(),
            "rights_state": "owned", "license_ref": "synthetic-fixture-only",
            "source_ref": "synthetic:evercraft-test-001",
            "evidence_state": "synthetic",
            "max_rmse_m": 0.25,
            "control_points": [
                {"pixel_x": x, "pixel_y": y,
                 "local_x_m": 10 + x*0.50, "local_z_m": 20 + y*0.50}
                for x, y in ((0, 0), (127, 0), (0, 95), (127, 95), (64, 48))
            ]
        }

    def test_fitted_affine_is_source_bound_and_not_verified(self):
        result = r.register_image(self.raw, self.image)
        self.assertEqual(result["image_sha256"], hashlib.sha256(self.image).hexdigest())
        self.assertEqual(result["pixel_to_local_m"], [0.5, 0.0, 10.0, 0.0, 0.5, 20.0])
        self.assertEqual(result["registration_rmse_m"], 0)
        for claim in ("north_verified", "crs_verified", "survey_grade",
                      "aerial_sheet_export_ready", "publication_authorized"):
            self.assertFalse(result[claim])
        self.assertIn("operator", result["registration_authority"])

    def test_missing_rights_license_and_derivative_permission_fail(self):
        self.raw["rights_state"] = "unknown"
        with self.assertRaisesRegex(r.RegistrationError, "rights_unresolved"):
            r.register_image(self.raw, self.image)
        self.raw["rights_state"] = "licensed"
        with self.assertRaisesRegex(r.RegistrationError, "derivative_use_not_approved"):
            r.register_image(self.raw, self.image)
        self.raw["derivative_use_approved"] = True
        self.raw["license_ref"] = ""
        with self.assertRaisesRegex(r.RegistrationError, "license_ref"):
            r.register_image(self.raw, self.image)

    def test_sha_mismatch_and_dimensions_fail(self):
        self.raw["expected_sha256"] = "0"*64
        with self.assertRaisesRegex(r.RegistrationError, "sha256_mismatch"):
            r.register_image(self.raw, self.image)
        self.raw["expected_sha256"] = hashlib.sha256(self.image).hexdigest()
        self.raw["pixel_width"] = 129
        with self.assertRaisesRegex(r.RegistrationError, "dimension_mismatch"):
            r.register_image(self.raw, self.image)

    def test_degenerate_and_inconsistent_controls_fail(self):
        self.raw["control_points"] = [
            {"pixel_x": x, "pixel_y": 0, "local_x_m": x*0.5, "local_z_m": 0}
            for x in (0, 20, 40, 60)
        ]
        with self.assertRaisesRegex(r.RegistrationError, "degenerate"):
            r.register_image(self.raw, self.image)
        self.setUp()
        self.raw["control_points"][-1]["local_x_m"] += 4
        with self.assertRaisesRegex(r.RegistrationError, "residual_exceeds_limit"):
            r.register_image(self.raw, self.image)

    def test_bad_png_header_and_control_point_fail(self):
        corrupt = bytearray(self.image)
        corrupt[21] ^= 1
        self.raw["expected_sha256"] = hashlib.sha256(corrupt).hexdigest()
        with self.assertRaisesRegex(r.RegistrationError, "ihdr_crc"):
            r.register_image(self.raw, bytes(corrupt))
        self.setUp()
        self.raw["control_points"][0]["pixel_x"] = 128
        with self.assertRaisesRegex(r.RegistrationError, "outside_image"):
            r.register_image(self.raw, self.image)


if __name__ == "__main__":
    unittest.main()
