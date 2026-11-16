#!/usr/bin/env python3
"""Evercraft Fallen -> OpenTimelineIO, non-executing editorial interchange.

OpenTimelineIO is an Apache-2.0 open-source library. This exports EXISTING
Fallen timelines to .otio so professional editors can work with cut information.
No publishing, source generation, video rendering, model calls or file writes
outside the explicit destination/receipt. No arbitrary plugin execution.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path

try:
    import opentimelineio as otio
except ImportError as exc:
    raise SystemExit("OpenTimelineIO missing: install pinned opentimelineio==0.18.1") from exc

VALID_TRACK_KINDS = {
    "video": "Video", "overlay": "Video",
    "voice": "Audio", "music": "Audio", "sfx": "Audio"
}
VALID_ASSETS = {"video", "image", "audio"}
HASH_CHUNK = 1024 * 1024


def digest(path):
    h = hashlib.sha256()
    with open(path, "rb") as source:
        while part := source.read(HASH_CHUNK):
            h.update(part)
    return h.hexdigest()


def frames(seconds, fps, field):
    if not isinstance(seconds, (int, float)) or not math.isfinite(seconds) or seconds < 0:
        raise ValueError(f"invalid_{field}")
    nearest = round(seconds * fps)
    if abs(nearest / fps - seconds) > 0.0002:
        raise ValueError(f"not_frame_aligned_{field}")
    return nearest


def rt(n_frames, fps):
    return otio.opentime.RationalTime(n_frames, fps)


def exported_snapshot(project, *, verify_media=False, asset_root=None):
    if not isinstance(project, dict) or project.get("schema") != "evercraft.fallen.timeline.v1":
        raise ValueError("fallen_timeline_schema_invalid")
    fps = project.get("fps")
    if not isinstance(fps, (int, float)) or not math.isfinite(fps) or fps <= 0 or fps > 120:
        raise ValueError("fallen_timeline_fps_invalid")
    if not project.get("id") or not isinstance(project.get("tracks"), list):
        raise ValueError("fallen_timeline_header_invalid")
    assets_list = project.get("assets", [])
    assets = {a["id"]: a for a in assets_list}
    if len(assets) != len(assets_list):
        raise ValueError("fallen_duplicate_asset")
    if not project["tracks"]:
        raise ValueError("fallen_timeline_tracks_empty")

    media_root = Path(asset_root).expanduser().resolve() if asset_root else None
    timeline = otio.schema.Timeline(name=project.get("title") or project["id"])
    timeline.metadata["evercraft"] = {
        "schema": "evercraft.fallen.otio-interchange.v1",
        "projectId": project["id"],
        "projectVersion": project.get("version"),
        "fps": fps,
        "aspectRatio": project.get("aspectRatio"),
        "sourceSystem": "evercraft.fallen.timeline.v1",
        "exportOnly": True,
        "publicationAuthorityGranted": False,
        "overlayAudioSemanticsMayRequireConform": True,
    }
    clip_rows = []
    seen_ids = set()
    for track_row in project["tracks"]:
        kind = track_row.get("kind")
        if kind not in VALID_TRACK_KINDS:
            raise ValueError(f"unsupported_track_kind:{kind}")
        out = otio.schema.Track(
            name=track_row.get("name") or track_row["id"],
            kind=getattr(otio.schema.TrackKind, VALID_TRACK_KINDS[kind]),
        )
        out.metadata["evercraft"] = {"trackId": track_row["id"], "kind": kind}
        cursor = 0
        for clip in sorted(track_row.get("clips", []), key=lambda c: (c["startSec"], c["id"])):
            clip_id = clip.get("id")
            if not clip_id or clip_id in seen_ids:
                raise ValueError("fallen_duplicate_or_missing_clip_id")
            seen_ids.add(clip_id)
            if clip.get("trackId") != track_row["id"]:
                raise ValueError("fallen_clip_track_mismatch:" + clip_id)
            asset = assets.get(clip.get("assetId"))
            if not asset or asset.get("kind") not in VALID_ASSETS:
                raise ValueError("fallen_asset_missing_or_invalid:" + clip_id)
            if asset["kind"] == "audio" and kind in ("video", "overlay"):
                raise ValueError("fallen_audio_on_picture_track:" + clip_id)
            if asset["kind"] in ("video", "image") and kind in ("voice", "music", "sfx"):
                raise ValueError("fallen_picture_on_audio_track:" + clip_id)
            source_refs = asset.get("sourceRefs")
            if not isinstance(source_refs, list) or not source_refs or not all(isinstance(v, str) and v.strip() for v in source_refs):
                raise ValueError("fallen_asset_provenance_missing:" + clip_id)
            sha = asset.get("digest", "")
            if not isinstance(sha, str) or len(sha) != 64 or any(c not in "0123456789abcdefABCDEF" for c in sha):
                raise ValueError("fallen_asset_sha256_invalid:" + clip_id)
            if str(asset.get("path", "")).startswith("pending://"):
                raise ValueError("fallen_asset_pending_generation:" + clip_id)
            media = Path(asset["path"]).expanduser().resolve()
            if media_root and not media.is_relative_to(media_root):
                raise ValueError("fallen_asset_outside_allowed_root:" + clip_id)
            if verify_media:
                if not media.is_file() or digest(media).lower() != sha.lower():
                    raise ValueError("fallen_media_missing_or_digest_mismatch:" + clip_id)
            start = frames(clip.get("startSec"), fps, f"{clip_id}_start")
            duration = frames(clip.get("durationSec"), fps, f"{clip_id}_duration")
            trim = frames(clip.get("trimStartSec", 0), fps, f"{clip_id}_trim")
            if duration <= 0:
                raise ValueError("fallen_clip_duration_invalid:" + clip_id)
            if start < cursor:
                raise ValueError("fallen_overlapping_clips_require_conform:" + track_row["id"])
            if start > cursor:
                out.append(otio.schema.Gap(
                    source_range=otio.opentime.TimeRange(rt(0, fps), rt(start - cursor, fps))
                ))
            ref = otio.schema.ExternalReference(target_url=media.as_uri())
            ref.metadata["evercraft"] = {
                "assetId": asset["id"], "sha256": sha.lower(),
                "sourceRefs": source_refs, "assetKind": asset["kind"],
                "evidenceState": asset.get("evidenceState", "not_set"),
            }
            out_clip = otio.schema.Clip(
                name=clip.get("label") or clip_id,
                media_reference=ref,
                source_range=otio.opentime.TimeRange(rt(trim, fps), rt(duration, fps)),
            )
            out_clip.metadata["evercraft"] = {
                "clipId": clip_id, "trackId": track_row["id"],
                "startFrame": start, "durationFrames": duration,
                "trimStartFrame": trim, "locked": bool(clip.get("locked", False)),
            }
            out.append(out_clip)
            clip_rows.append({"clipId": clip_id, "trackId": track_row["id"],
                              "assetId": asset["id"], "startFrames": start,
                              "durationFrames": duration, "trimStartFrames": trim})
            cursor = start + duration
        timeline.tracks.append(out)
    if not clip_rows:
        raise ValueError("fallen_timeline_empty")
    return timeline, clip_rows


def export(project_path, output_path, *, verify_media=False, asset_root=None):
    project = json.loads(Path(project_path).read_text(encoding="utf-8"))
    timeline, expected = exported_snapshot(project, verify_media=verify_media, asset_root=asset_root)
    output = Path(output_path).expanduser().resolve()
    if output.suffix != ".otio":
        raise ValueError("output_extension_must_be_otio")
    output.parent.mkdir(parents=True, exist_ok=True)
    otio.adapters.write_to_file(timeline, str(output))
    # Read using the real OpenTimelineIO parser, not our own JSON assumptions.
    reread = otio.adapters.read_from_file(str(output))
    received = []
    for track in reread.tracks:
        cursor = 0
        for item in track:
            if isinstance(item, otio.schema.Gap):
                cursor += round(item.duration().value)
                continue
            if not isinstance(item, otio.schema.Clip):
                raise ValueError("otio_roundtrip_unexpected_item")
            ext = item.metadata.get("evercraft", {})
            received.append({
                "clipId": ext.get("clipId"),
                "trackId": ext.get("trackId"),
                "assetId": item.media_reference.metadata.get("evercraft", {}).get("assetId"),
                "startFrames": cursor,
                "durationFrames": round(item.source_range.duration.value),
                "trimStartFrames": round(item.source_range.start_time.value),
            })
            cursor += round(item.source_range.duration.value)
    if received != expected:
        raise ValueError("otio_roundtrip_edit_invariant_mismatch")
    report = {
        "schema": "evercraft.fallen.otio-export-receipt.v1",
        "sourceProject": project["id"],
        "projectVersion": project.get("version"),
        "output": str(output),
        "sha256": digest(output),
        "trackCount": len(reread.tracks),
        "clipCount": len(expected),
        "mediaDigestsChecked": verify_media,
        "realOpenTimelineIORoundtrip": True,
        "notes": "Cut metadata only; media files remain external. Overlay/FX/audio-mix require editor-specific conform.",
        "publicationAuthorityGranted": False,
    }
    output.with_suffix(".otio.receipt.json").write_text(
        json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Export Fallen timeline to OpenTimelineIO")
    parser.add_argument("project", help="Fallen .json timeline")
    parser.add_argument("output", help="Output .otio path")
    parser.add_argument("--verify-media", action="store_true", help="Check SHA-256 of referenced files")
    parser.add_argument("--asset-root", default=None, help="Optional allowed media root directory")
    args = parser.parse_args()
    print(json.dumps(export(args.project, args.output,
                            verify_media=args.verify_media,
                            asset_root=args.asset_root), indent=2))
