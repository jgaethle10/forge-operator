"""No-network, fake-file safety tests for real-data recovery launcher."""
import os
import subprocess
import tempfile
import unittest
import zipfile
from pathlib import Path

SCRIPT=Path(__file__).with_name("recover_and_run_gems004.sh")


class RecoveryGates(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)
        self.data=self.root/"private-data"
        self.data.mkdir()
        self.out=self.root/"private-output"
        self.archive=self.root/"preserved-gems001.zip"
        # A valid ZIP but intentionally invalid model bytes.
        with zipfile.ZipFile(self.archive,"w") as z:
            z.writestr("run.py",b"test-only-untrusted-model")
        self.bin=self.root/"bin"
        self.bin.mkdir()
        self.marker=self.root/"network-request-should-never-occur"
        fakecurl=self.bin/"curl"
        fakecurl.write_text("#!/bin/sh\ntouch '"+str(self.marker)+"'\nexit 98\n")
        fakecurl.chmod(0o755)

    def call(self, data=None, archive=None, out=None, flag=None):
        env=os.environ.copy()
        env.pop("GEMS_REPEAT",None)
        env["PATH"]=str(self.bin)+os.pathsep+env.get("PATH","")
        args=["bash",str(SCRIPT),str(data or self.data),
              str(archive or self.archive),str(out or self.out)]
        if flag is not None:args.append(flag)
        return subprocess.run(args,env=env,text=True,capture_output=True,timeout=15)

    def test_bash_syntax(self):
        result=subprocess.run(["bash","-n",str(SCRIPT)],
                              capture_output=True,text=True,timeout=10)
        self.assertEqual(result.returncode,0,result.stderr)

    def test_invalid_archive_blocks_download_even_when_explicitly_allowed(self):
        r=self.call(flag="--fetch-verified-mirror")
        self.assertNotEqual(r.returncode,0)
        self.assertIn("archived model SHA256 mismatch",r.stderr)
        self.assertFalse(self.marker.exists())
        self.assertFalse(self.out.exists())
        self.assertEqual(list(self.data.iterdir()),[])

    def test_missing_original_archive_fails_before_network(self):
        self.archive.unlink()
        r=self.call(flag="--fetch-verified-mirror")
        self.assertEqual(r.returncode,65)
        self.assertFalse(self.marker.exists())
        self.assertFalse(self.out.exists())

    def test_invalid_flag_never_contacts_mirror(self):
        r=self.call(flag="--submit")
        self.assertEqual(r.returncode,64)
        self.assertFalse(self.marker.exists())

    def test_refuses_output_inside_source_even_with_good_directory(self):
        r=self.call(out=self.data/"evidence",flag="--fetch-verified-mirror")
        self.assertEqual(r.returncode,65)
        self.assertFalse(self.marker.exists())
        self.assertFalse((self.data/"evidence").exists())

    def test_refuses_existing_output_and_symlink_archive(self):
        self.out.mkdir()
        r=self.call()
        self.assertEqual(r.returncode,66)
        self.out.rmdir()
        link=self.root/"fake-link.zip"
        link.symlink_to(self.archive)
        r=self.call(archive=link,flag="--fetch-verified-mirror")
        self.assertEqual(r.returncode,65)
        self.assertFalse(self.marker.exists())

    def test_repeat_guard_does_not_allow_training(self):
        env=os.environ.copy()
        env["GEMS_REPEAT"]="1"
        r=subprocess.run(["bash",str(SCRIPT),str(self.data),
                          str(self.archive),str(self.out)],
                         env=env,capture_output=True,text=True,timeout=15)
        self.assertEqual(r.returncode,67)
        self.assertFalse(self.out.exists())


if __name__=="__main__":
    unittest.main()
