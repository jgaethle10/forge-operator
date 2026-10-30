"""Read-only runtime dependency diagnostics: avoid false-green on exit code 127."""
import importlib.util
from pathlib import Path
import unittest

module_path = Path(__file__).resolve().parent / 'accept-sovereign-inference.py'
spec = importlib.util.spec_from_file_location('sovereign_acceptance', module_path)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class DependencyTests(unittest.TestCase):
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
