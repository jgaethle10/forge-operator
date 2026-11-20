import importlib.util
from pathlib import Path
import tempfile
import unittest
import zipfile

SOURCE = Path(__file__).resolve().parents[1] / "scripts/yvl-v4-artifact-recovery.py"
spec = importlib.util.spec_from_file_location("yvl_v4_source_guard", SOURCE)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def create_zip(root, name, members):
    with zipfile.ZipFile(root / name, "w", compression=zipfile.ZIP_DEFLATED) as f:
        for member, content in members.items():
            f.writestr(member, content)


def valid_fixtures(root):
    create_zip(root, "Evercraft_YVL_v4_Interactive_Site.zip", {
        "site/index.html": "<html><title>YVL</title><body><main>Library</main></body></html>",
        "site/app.js": "console.log('offline preview')",
    })
    create_zip(root, "Evercraft_YVL_v4_WordPress_Theme.zip", {
        "theme/style.css": "/* Theme Name: Evercraft YVL Concept */",
        "theme/index.php": "<?php echo esc_html('Library');",
    })
    create_zip(root, "Evercraft_YVL_v4_Content_Plugin.zip", {
        "yvl-content/content.php": "<?php /* Plugin Name: Evercraft YVL Content Model */ register_post_type('branch', []);",
    })
    create_zip(root, "Evercraft_YVL_v4_Engineering_Pack.zip", {
        "README.md": "Original engineering QA",
        "tools/wxr-migration.py": "print('synthetic example')",
    })


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_all_original_archive_shapes_are_structurally_checkable(self):
        valid_fixtures(self.root)
        result = module.audit(self.root)
        self.assertTrue(result["archive_integrity_verified"])
        self.assertTrue(result["structural_review_complete"])
        self.assertEqual(result["original_zip_bytes_verified"], 4)
        self.assertEqual(len(result["artifacts"]), 4)
        for artifact in result["artifacts"]:
            self.assertEqual(artifact["status"], "structurally_valid")
            self.assertEqual(len(artifact["sha256"]), 64)
        self.assertFalse(result["wordpress_runtime_verified"])
        self.assertFalse(result["accessibility_wcag22aa_verified"])
        self.assertFalse(result["public_library_client_experience_verified"])
        self.assertFalse(result["production_deployed"])
        self.assertFalse(result["proposal_submitted"])

    def test_missing_source_is_reported_and_never_recreated(self):
        result = module.audit(self.root)
        self.assertEqual(result["original_zip_bytes_verified"], 0)
        self.assertFalse(result["structural_review_complete"])
        self.assertTrue(all(a["status"] == "missing" for a in result["artifacts"]))
        self.assertEqual(list(self.root.iterdir()), [])

    def test_traversal_zip_is_blocked_without_extracting(self):
        create_zip(self.root, "Evercraft_YVL_v4_Interactive_Site.zip", {
            "../outside.txt": "malicious", "site/index.html": "<html></html>"
        })
        result = module.audit(self.root)
        match = result["artifacts"][0]
        self.assertEqual(match["status"], "blocked")
        self.assertIn("unsafe_archive_member_path", match["review_flags"])
        self.assertFalse((self.root.parent / "outside.txt").exists())

    def test_missing_plugin_or_theme_headers_require_source_review(self):
        valid_fixtures(self.root)
        create_zip(self.root, "Evercraft_YVL_v4_WordPress_Theme.zip", {
            "theme/style.css": "body{}",
            "theme/index.php": "<?php",
        })
        create_zip(self.root, "Evercraft_YVL_v4_Content_Plugin.zip", {
            "plugin/plugin.php": "<?php /* undocumented plugin */"
        })
        r = module.audit(self.root)
        self.assertFalse(r["structural_review_complete"])
        self.assertEqual(r["artifacts"][1]["status"], "needs_source_review")
        self.assertIn("wordpress_theme_header_not_found", r["artifacts"][1]["review_flags"])
        self.assertIn("wordpress_plugin_header_not_found", r["artifacts"][2]["review_flags"])
        self.assertIn("content_type_registration_needs_review", r["artifacts"][2]["review_flags"])

    def test_corrupt_archive_fails_closed(self):
        (self.root / "Evercraft_YVL_v4_Engineering_Pack.zip").write_bytes(b"not a zip")
        r = module.audit(self.root)
        self.assertEqual(r["artifacts"][-1]["status"], "blocked")
        self.assertFalse(r["archive_integrity_verified"])

    def test_case_insensitive_duplicate_paths_are_blocked(self):
        create_zip(self.root, "Evercraft_YVL_v4_Interactive_Site.zip", {
            "site/index.html": "x", "SITE/INDEX.HTML": "y"
        })
        r = module.audit(self.root)
        self.assertEqual(r["artifacts"][0]["status"], "blocked")
        self.assertIn("duplicate_archive_member_name", r["artifacts"][0]["review_flags"])


if __name__ == "__main__":
    unittest.main()
