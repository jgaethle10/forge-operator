"""Dependency-free contract tests. Does not execute real speech recognition."""
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from faster_whisper_local import transcribe_local, require_files


class LocalWhisperAdapterTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.audio = root / "prepared.wav"
        self.audio.write_bytes(b"synthetic audio fixture")
        self.model = root / "local-model"
        self.model.mkdir()
        for filename in ("config.json", "model.bin", "tokenizer.json"):
            (self.model / filename).write_bytes(b"synthetic model fixture")

    def test_local_only_cpu_int8_and_segments(self):
        seen = {}
        class FakeWhisperModel:
            def __init__(self, model_path, **kwargs):
                seen["model"] = model_path
                seen["engine"] = kwargs

            def transcribe(self, input_path, **kwargs):
                seen["audio"] = input_path
                seen["options"] = kwargs
                return iter([
                    SimpleNamespace(start=0.3, end=1.4, text="  Hello   world  "),
                    SimpleNamespace(start=1.5, end=2.1, text="again"),
                ]), None

        payload = transcribe_local(self.audio, self.model, FakeWhisperModel, "en")
        self.assertEqual(payload, {"segments": [
            {"start": 0.3, "end": 1.4, "text": "Hello world"},
            {"start": 1.5, "end": 2.1, "text": "again"},
        ]})
        self.assertEqual(seen["engine"], {
            "device": "cpu", "compute_type": "int8", "local_files_only": True
        })
        self.assertEqual(seen["options"], {
            "beam_size": 5, "vad_filter": False, "language": "en"
        })
        self.assertEqual(seen["audio"], str(self.audio.resolve()))

    def test_absent_local_model_fails_before_engine(self):
        (self.model / "tokenizer.json").unlink()
        with self.assertRaises(ValueError):
            require_files(self.audio, self.model)

    def test_missing_audio_fails(self):
        with self.assertRaises(FileNotFoundError):
            require_files(self.audio.parent / "missing.wav", self.model)

    def test_invalid_segments_are_dropped(self):
        class FakeWhisperModel:
            def __init__(self, *_args, **_kwargs):
                pass
            def transcribe(self, *_args, **_kwargs):
                return iter([
                    SimpleNamespace(start=-1, end=2, text="invalid"),
                    SimpleNamespace(start=4, end=2, text="backwards"),
                    SimpleNamespace(start=1, end=2, text="valid"),
                    SimpleNamespace(start=3, end=4, text="   "),
                ]), None

        self.assertEqual(
            transcribe_local(self.audio, self.model, FakeWhisperModel),
            {"segments": [{"start": 1.0, "end": 2.0, "text": "valid"}]}
        )


    def test_cli_emits_existing_forensiscope_json_contract(self):
        stub = Path(self.temp.name) / "faster_whisper.py"
        stub.write_text("""\
from types import SimpleNamespace
class WhisperModel:
    def __init__(self, path, **kwargs):
        assert kwargs == {'device': 'cpu', 'compute_type': 'int8', 'local_files_only': True}
    def transcribe(self, audio, **kwargs):
        assert kwargs == {'beam_size': 5, 'vad_filter': False}
        return iter([SimpleNamespace(start=0.0, end=1.2, text='Synthetic transcript')]), None
""")
        result = subprocess.run(
            [sys.executable, str(Path(__file__).with_name("faster_whisper_local.py")),
             "--input", str(self.audio), "--model-dir", str(self.model)],
            env={**os.environ, "PYTHONPATH": self.temp.name},
            text=True, capture_output=True, timeout=10, check=False
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout), {"segments": [
            {"start": 0.0, "end": 1.2, "text": "Synthetic transcript"}
        ]})
        self.assertFalse(result.stderr)

    def test_cli_error_never_leaks_transcript(self):
        stub = Path(self.temp.name) / "faster_whisper.py"
        stub.write_text("""\
class WhisperModel:
    def __init__(self, *_args, **_kwargs):
        raise RuntimeError('CONFIDENTIAL_CUSTOMER_AUDIO')
""")
        result = subprocess.run(
            [sys.executable, str(Path(__file__).with_name("faster_whisper_local.py")),
             "--input", str(self.audio), "--model-dir", str(self.model)],
            env={**os.environ, "PYTHONPATH": self.temp.name},
            text=True, capture_output=True, timeout=10, check=False
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("CONFIDENTIAL_CUSTOMER_AUDIO", result.stderr + result.stdout)
        self.assertIn("RuntimeError", result.stderr)

    def test_segment_limit_is_hard_failure(self):
        class FakeWhisperModel:
            def __init__(self, *_args, **_kwargs):
                pass
            def transcribe(self, *_args, **_kwargs):
                def items():
                    for _ in range(10001):
                        yield SimpleNamespace(start=0, end=1, text="Synthetic")
                return items(), None
        with self.assertRaisesRegex(ValueError, "segment limit"):
            transcribe_local(self.audio, self.model, FakeWhisperModel)

if __name__ == "__main__":
    unittest.main()
