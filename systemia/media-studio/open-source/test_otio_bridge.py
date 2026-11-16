#!/usr/bin/env python3
import copy
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

import opentimelineio as otio
from otio_bridge import export, exported_snapshot


class OTIOBridgeTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="fallen-otio-")
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.media = self.root / "work.mp4"
        self.audio = self.root / "score.wav"
        self.media.write_bytes(b"test-only-video-reference")
        self.audio.write_bytes(b"test-only-audio-reference")
        self.project = {
            "schema": "evercraft.fallen.timeline.v1",
            "id": "commercial-001",
            "title": "Evercraft Film",
            "aspectRatio": "16:9",
            "fps": 24,
            "version": 3,
            "assets": [
                {"id": "v1", "path": str(self.media),
                 "digest": hashlib.sha256(self.media.read_bytes()).hexdigest(),
                 "kind": "video", "sourceRefs": ["owned:work-001"], "evidenceState": "observed"},
                {"id": "a1", "path": str(self.audio),
                 "digest": hashlib.sha256(self.audio.read_bytes()).hexdigest(),
                 "kind": "audio", "sourceRefs": ["licensed:music-001"]}
            ],
            "tracks": [
                {"id": "picture", "kind": "video", "name": "Picture", "clips": [
                    {"id": "shot-1", "trackId": "picture", "assetId": "v1",
                     "startSec": 0, "durationSec": 1, "trimStartSec": 0.5},
                    {"id": "shot-2", "trackId": "picture", "assetId": "v1",
                     "startSec": 2, "durationSec": 1, "trimStartSec": 1.5}
                ]},
                {"id": "music", "kind": "music", "name": "Score", "clips": [
                    {"id": "score", "trackId": "music", "assetId": "a1",
                     "startSec": 0, "durationSec": 3}
                ]}
            ]
        }

    def write_project(self):
        path = self.root / "input.json"
        path.write_text(json.dumps(self.project), encoding="utf8")
        return path

    def test_real_otio_roundtrip_preserves_media_sha_cut_and_gaps(self):
        receipt = export(self.write_project(), self.root / "output.otio",
                         verify_media=True, asset_root=self.root)
        self.assertEqual(receipt["clipCount"], 3)
        self.assertEqual(receipt["trackCount"], 2)
        self.assertTrue(receipt["realOpenTimelineIORoundtrip"])
        self.assertTrue(receipt["mediaDigestsChecked"])
        self.assertFalse(receipt["publicationAuthorityGranted"])
        timeline = otio.adapters.read_from_file(str(self.root / "output.otio"))
        self.assertEqual(timeline.metadata["evercraft"]["projectId"], "commercial-001")
        self.assertEqual(len(timeline.tracks[0]), 3)  # shot, 1s gap, shot
        self.assertIsInstance(timeline.tracks[0][1], otio.schema.Gap)
        self.assertEqual(timeline.tracks[0][2].source_range.start_time.value, 36)
        self.assertEqual(timeline.tracks[0][2].metadata["evercraft"]["startFrame"], 48)
        self.assertEqual(list(timeline.tracks[0][0].media_reference.metadata["evercraft"]["sourceRefs"]),
                         ["owned:work-001"])
        self.assertTrue((self.root / "output.otio.receipt.json").exists())

    def test_hash_mismatch_blocks_export(self):
        self.media.write_bytes(b"tampered")
        with self.assertRaisesRegex(ValueError, "digest_mismatch"):
            export(self.write_project(), self.root / "denied.otio",
                   verify_media=True, asset_root=self.root)
        self.assertFalse((self.root / "denied.otio").exists())

    def test_pending_generation_never_leaks_to_editor(self):
        self.project["assets"][0]["path"] = "pending://render-7"
        with self.assertRaisesRegex(ValueError, "pending_generation"):
            exported_snapshot(self.project)

    def test_source_provenance_required(self):
        self.project["assets"][0]["sourceRefs"] = []
        with self.assertRaisesRegex(ValueError, "provenance_missing"):
            exported_snapshot(self.project)

    def test_overlaps_fail_closed(self):
        self.project["tracks"][0]["clips"][1]["startSec"] = .5
        with self.assertRaisesRegex(ValueError, "overlapping_clips"):
            exported_snapshot(self.project)

    def test_non_frame_aligned_edits_fail_closed(self):
        self.project["tracks"][0]["clips"][1]["startSec"] = 2.016
        with self.assertRaisesRegex(ValueError, "not_frame_aligned"):
            exported_snapshot(self.project)

    def test_overlay_only_if_separate_track(self):
        overlay = copy.deepcopy(self.project["tracks"][0])
        overlay["kind"] = "overlay"
        overlay["id"] = "overlay"
        overlay["clips"] = [{
            "id": "logo", "trackId": "overlay", "assetId": "v1",
            "startSec": .5, "durationSec": .5
        }]
        self.project["tracks"].append(overlay)
        timeline, rows = exported_snapshot(self.project)
        self.assertEqual(len(timeline.tracks), 3)
        self.assertEqual(len(rows), 4)

    def test_captions_require_separate_adaptor(self):
        self.project["tracks"].append({"id": "captions", "kind": "captions",
                                       "name": "Captions", "clips": []})
        with self.assertRaisesRegex(ValueError, "unsupported_track_kind:captions"):
            exported_snapshot(self.project)

    def test_allowed_root_prevents_path_escapes(self):
        with self.assertRaisesRegex(ValueError, "outside_allowed_root"):
            exported_snapshot(self.project, asset_root=self.root / "subdir")

    def test_no_remote_or_unapproved_upload(self):
        timeline, _ = exported_snapshot(self.project)
        self.assertFalse(timeline.metadata["evercraft"]["publicationAuthorityGranted"])
        self.assertTrue(timeline.metadata["evercraft"]["exportOnly"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
