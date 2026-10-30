"""Read-only runtime dependency diagnostics: avoid false-green on exit code 127."""
import importlib.util
from pathlib import Path
import unittest
from contextlib import redirect_stdout, redirect_stderr
import io
import json
import os
import subprocess
import tempfile
from unittest.mock import patch

module_path = Path(__file__).resolve().parent / 'accept-sovereign-inference.py'
spec = importlib.util.spec_from_file_location('sovereign_acceptance', module_path)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class DependencyTests(unittest.TestCase):
    def test_missing_runtime_dependency_retains_blocked_receipt(self):
        """Physical regression class identified independently by Lab PR #30."""
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            root = base / 'verified-test' / 'stage-root'
            executable = root / 'opt/evercraft-ai/runtime/current/bin/llama-server'
            executable.parent.mkdir(parents=True)
            executable.write_text('synthetic test executable; never run')
            executable.chmod(0o700)
            gateway = root / 'opt/evercraft-ai/current/lib/evercraft_ai/cli.py'
            gateway.parent.mkdir(parents=True)
            gateway.write_text('# synthetic fixture')
            (root.parent / 'stage-receipt.json').write_text(json.dumps({
                'signed_manifest_verified': True, 'state': 'verified_staged_only_not_deployed',
                'stage_root': str(root)}))
            provision = root / 'var/lib/evercraft-ai/receipts/node001-provision.json'
            provision.parent.mkdir(parents=True)
            provision.write_text(json.dumps({'status': 'provisioned-not-certified',
                'runtime': {'sha256': mod.RUNTIME_SHA}, 'model': {'sha256': mod.MODEL_SHA}}))
            diagnostic = subprocess.CompletedProcess(['ldd'], 0, 'libgomp.so.1 => not found\n', '')
            with patch.object(mod, 'ROOT_BASE', base), patch.object(mod.os, 'geteuid', return_value=1000), \
                 patch.object(mod.sys, 'argv', ['accept', '--stage-root', str(root)]), \
                 patch.object(mod.subprocess, 'run', return_value=diagnostic) as probe, \
                 patch.object(mod.subprocess, 'Popen') as launch, \
                 patch.object(mod, 'check_digest') as digest, \
                 redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
                with self.assertRaisesRegex(RuntimeError, 'libgomp'):
                    mod.main()
            self.assertEqual(probe.call_count, 1)
            digest.assert_not_called()
            launch.assert_not_called()
            receipts = list(root.parent.glob('inference-*/inference-receipt.json'))
            self.assertEqual(len(receipts), 1, 'blocked dependency must leave one receipt')
            receipt = json.loads(receipts[0].read_text())
            self.assertEqual(receipt['state'], 'FIRST_INFERENCE_BLOCKED')
            self.assertIs(receipt['real_local_inference'], False)
            self.assertIs(receipt['child_processes_stopped'], True)
            self.assertIn('libgomp.so.1', receipt['error'])
            self.assertEqual(os.stat(receipts[0]).st_mode & 0o777, 0o600)

    def test_missing_libgomp_detected(self):
        output = '''
            linux-vdso.so.1 (0x123)
            libggml.so.0 => /tmp/libggml.so.0 (0x123)
            libgomp.so.1 => not found
            libstdc++.so.6 => /usr/lib/libstdc++.so.6 (0x123)
        '''
        self.assertEqual(mod.missing_shared_libraries(output), ['libgomp.so.1'])

    def test_clean_linker_has_no_false_missing_dependencies(self):
        output = '''
            libllama.so.0 => /private/payload/libllama.so.0 (0x123)
            libgomp.so.1 => /usr/lib/x86_64-linux-gnu/libgomp.so.1 (0x456)
        '''
        self.assertEqual(mod.missing_shared_libraries(output), [])

    def test_multiple_missing_libraries_captured(self):
        self.assertEqual(
            mod.missing_shared_libraries(
                'libgomp.so.1 => not found\nlibz.so.1 => not found\n'
            ), ['libgomp.so.1', 'libz.so.1'])

if __name__ == '__main__':
    unittest.main()
