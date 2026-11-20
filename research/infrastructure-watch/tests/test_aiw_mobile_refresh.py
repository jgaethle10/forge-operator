"""Safety checks for the owned-edge AIW mobile-only release revision."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

FILE=Path(__file__).resolve().parents[1]/"release"/"aiw_mobile_refresh_penguin.py"
spec=importlib.util.spec_from_file_location("aiw_mobile_refresh",FILE)
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

def synthetic_original():
    files={name:("synthetic static data: "+name).encode()
           for name in mod.EXPECTED-{"release.json","SHA256SUMS"}}
    manifest={
        "schema":"evercraft.aiw.public-beta-static.v1",
        "source_commit":mod.ORIGINAL_COMMIT,
        "public_url_verified":False,
        "public_release_ready":False,
        "wa_2026_total":8619,
        "wa_2026_poor":403,
        "wa_2026_deep_records":8618,
        "national_state_summaries_2025":52,
        "files":{name:mod.checksum(value) for name,value in sorted(files.items())},
    }
    files["release.json"]=(__import__("json").dumps(manifest,sort_keys=True,separators=(",",":"))+"\n").encode()
    files["SHA256SUMS"]=("".join(
        mod.checksum(files[name])+"  "+name+"\n"
        for name in sorted(mod.EXPECTED-{"SHA256SUMS"})
    )).encode()
    return files,manifest

class MobileReleaseTests(unittest.TestCase):
    def test_mobile_revision_changes_only_index_and_receipts(self):
        old,manifest=synthetic_original()
        mod.validate_files(old,mod.ORIGINAL_COMMIT)
        revision="a"*40
        changed=mod.candidate(revision,old,manifest,b"updated public mobile map")
        release=mod.validate_files(changed,revision)
        self.assertEqual(release["ui_revision"],"mobile-calm-selection-2026-11-20")
        self.assertEqual(release["data_source_commit"],mod.ORIGINAL_COMMIT)
        self.assertEqual(release["data_archive_sha256"],mod.ORIGINAL_ARCHIVE_SHA)
        self.assertFalse(release["public_url_verified"])
        for name in mod.EXPECTED-{"index.html","release.json","SHA256SUMS"}:
            self.assertEqual(changed[name],old[name],name)
        self.assertNotEqual(changed["index.html"],old["index.html"])
        changed["data/states.json"]=b"tampered"
        with self.assertRaisesRegex(RuntimeError,"hash mismatch"):
            mod.validate_files(changed,revision)

    def test_atomic_symlink_swap_preserves_both_releases(self):
        with tempfile.TemporaryDirectory() as t:
            root=Path(t)
            old=root/"old";new=root/"new"
            old.mkdir();new.mkdir()
            current=root/"current"
            current.symlink_to(old)
            prior_root,prior_current=mod.ROOT,mod.CURRENT
            try:
                mod.ROOT,mod.CURRENT=root,current
                mod.link_to(new)
                self.assertTrue(current.is_symlink())
                self.assertEqual(current.resolve(),new)
                mod.link_to(old)
                self.assertEqual(current.resolve(),old)
                self.assertTrue(new.is_dir())
                self.assertTrue(old.is_dir())
            finally:
                mod.ROOT,mod.CURRENT=prior_root,prior_current

if __name__=="__main__":
    unittest.main()
