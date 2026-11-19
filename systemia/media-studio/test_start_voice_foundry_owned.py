#!/usr/bin/env python3
"""Owned-node Voice Foundry launcher: offline and no-service-change tests."""
import importlib.util
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch

PATH=Path(__file__).with_name("start-voice-foundry-owned.py")
spec=importlib.util.spec_from_file_location("voice_launch",PATH)
app=importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)


class OwnedVoiceLaunchTests(unittest.TestCase):
    def test_offline_resolution_enforced(self):
        self.assertEqual(app.OFFLINE_ENV["HF_HUB_OFFLINE"],"1")
        self.assertEqual(app.OFFLINE_ENV["TRANSFORMERS_OFFLINE"],"1")
        self.assertEqual(app.OFFLINE_ENV["HF_DATASETS_OFFLINE"],"1")
        self.assertEqual(app.HOST,"127.0.0.1")

    def test_preflight_does_not_claim_model_weights_cached(self):
        record=app.inspect_environment()
        self.assertFalse(record["networkModelResolutionAllowed"])
        self.assertFalse(record["modelWeightsVerifiedCached"])
        self.assertFalse(record["publicServiceDeployed"])
        self.assertFalse(record["iphoneRemoteServiceEnabled"])
        self.assertFalse(record["releaseApproved"])
        self.assertEqual(record["runtimeHost"],"127.0.0.1")

    def test_missing_dependencies_fail_without_exec_or_installs(self):
        fake={"localDependenciesPresent":False}
        with patch.object(app,"inspect_environment",return_value=fake):
            with patch.object(app.os,"execvpe") as exec_mock:
                with self.assertRaisesRegex(RuntimeError,"MISSING"):
                    app.launch(8766,"/tmp/private")
                exec_mock.assert_not_called()

    def test_exec_target_is_local_and_no_unsafe_host(self):
        fake={"localDependenciesPresent":True}
        with patch.object(app,"inspect_environment",return_value=fake):
            with patch.object(app.os,"execvpe") as execute:
                app.launch(8766,"/tmp/private-review")
                execute.assert_called_once()
                program,args,env=execute.call_args.args
                self.assertEqual(program,sys.executable)
                self.assertIn("--host",args)
                self.assertEqual(args[args.index("--host")+1],"127.0.0.1")
                self.assertEqual(args[args.index("--port")+1],"8766")
                self.assertEqual(env["HF_HUB_OFFLINE"],"1")
                self.assertEqual(env["TRANSFORMERS_OFFLINE"],"1")

    def test_relative_review_location_rejected(self):
        fake={"localDependenciesPresent":True}
        with patch.object(app,"inspect_environment",return_value=fake):
            with patch.object(app.os,"execvpe") as execute:
                with self.assertRaisesRegex(ValueError,"ABSOLUTE"):
                    app.launch(8766,"relative/path")
                execute.assert_not_called()

    def test_real_cli_check_no_model_import_or_download(self):
        p=subprocess.run([sys.executable,str(PATH),"--check-only"],
                         check=True,capture_output=True,text=True,timeout=8)
        self.assertIn('"networkModelResolutionAllowed": false',p.stdout)
        self.assertIn('"runtimeHost": "127.0.0.1"',p.stdout)


if __name__=="__main__":
    unittest.main()
