#!/usr/bin/env python3
"""Evercraft-owned offline cinematic generation worker, v1.

Use only locally installed, audited Wan 2.1 T2V 1.3B model files and CUDA device.
Runs under the Fallen adapter's bounded single-shot request. No downloads, publishing,
remote provider APIs, or synthetic claim that a canary is a finished commercial.

Optional dependencies (on a compatible GPU machine): torch, diffusers, transformers,
accelerate, imageio, imageio-ffmpeg, ftfy; ffmpeg executable. This module is not
installed/launched automatically on NextGen or any production node.
"""
import argparse
import hashlib
import json
import math
import os
import subprocess
from pathlib import Path


def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with p.open('rb') as f:
        while chunk := f.read(8 * 1024 * 1024):
            h.update(chunk)
    return h.hexdigest()


def require(condition: bool, message: str):
    if not condition:
        raise RuntimeError(message)


def verify_local_model(request: dict) -> Path:
    model_path = Path(os.environ.get('EVERCRAFT_LOCAL_WAN_MODEL', '')).expanduser()
    manifest_path = Path(os.environ.get('EVERCRAFT_LOCAL_WAN_MANIFEST', '')).expanduser()
    require(model_path.is_dir(), 'local_wan_model_directory_missing')
    require(manifest_path.is_file(), 'local_wan_manifest_missing')
    require(sha256_file(manifest_path) == request['weightsSha256'], 'wan_manifest_digest_mismatch')
    manifest = json.loads(manifest_path.read_text())
    require(manifest.get('schema') == 'evercraft.local-video.weights-manifest.v1', 'wan_manifest_schema_invalid')
    require(manifest.get('modelFamily') == 'wan2.1-t2v-1.3b', 'wan_model_family_unsupported')
    require(manifest.get('modelLicenseId') == request['modelLicenseId'], 'wan_model_license_mismatch')
    files = manifest.get('files', [])
    require(files, 'wan_weights_manifest_files_missing')
    root = model_path.resolve()
    for entry in files:
        path = (root / entry['path']).resolve()
        require(path.is_relative_to(root) and path.is_file(), 'wan_weights_file_outside_model_root')
        require(sha256_file(path) == entry['sha256'], 'wan_weights_file_digest_mismatch')
    return root


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--request', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    os.environ['HF_HUB_OFFLINE'] = '1'
    os.environ['TRANSFORMERS_OFFLINE'] = '1'
    os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
    request = json.loads(Path(args.request).read_text())
    require(request.get('schema') == 'evercraft.local-video.worker-request.v1', 'wan_request_schema_invalid')
    require(request.get('modelId') == 'evercraft:owned-video-v1', 'wan_wrong_model_binding')
    require(request.get('publicationAuthority') is False, 'wan_publication_authority_forbidden')
    require(request.get('references') == [], 'wan_v1_text_to_video_only')
    duration = float(request['durationSec'])
    require(1 <= duration <= 10, 'wan_duration_outside_limits')
    require(request.get('resolution') == '720p', 'wan_resolution_invalid')
    require(request.get('aspectRatio') in ('16:9', '9:16'), 'wan_aspect_invalid')
    require(12 <= len(request.get('prompt', '')) <= 6000, 'wan_prompt_invalid')
    model_dir = verify_local_model(request)

    import torch
    from diffusers import AutoencoderKLWan, WanPipeline
    from diffusers.schedulers.scheduling_unipc_multistep import UniPCMultistepScheduler
    from diffusers.utils import export_to_video

    require(torch.cuda.is_available(), 'wan_cuda_gpu_missing')
    vram_gb = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
    require(vram_gb >= 10.0, f'wan_gpu_memory_insufficient:{vram_gb:.1f}GiB')
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    video_raw = output / 'raw-wan.mp4'
    video_final = output / 'shot.mp4'
    # Keep the Wan VAE in float32 to prevent decode artifacts; the denoiser runs in bf16.
    # This matches the upstream Diffusers reference and uses only pinned local weights.
    vae = AutoencoderKLWan.from_pretrained(
        str(model_dir), subfolder='vae', local_files_only=True, dtype=torch.float32
    )
    pipe = WanPipeline.from_pretrained(
        str(model_dir), vae=vae, local_files_only=True, dtype=torch.bfloat16
    )
    pipe.scheduler = UniPCMultistepScheduler.from_config(pipe.scheduler.config, flow_shift=3.0)
    pipe.enable_model_cpu_offload()
    # Wan 1.3B is native 480p only; 720p output is upscaled review footage.
    # Wan requests 4*k+1 frames, generated at 16fps before 24fps delivery conversion.
    frames = 4 * math.ceil(duration * 16 / 4) + 1
    vertical = request['aspectRatio'] == '9:16'
    width, height = (480, 832) if vertical else (832, 480)
    seed = int(os.environ.get('EVERCRAFT_VIDEO_SEED', '44'))
    with torch.inference_mode():
        result = pipe(prompt=request['prompt'], negative_prompt='watermark, logo, text, subtitles, deformed hands, static image, warped anatomy',
                      height=height, width=width, num_frames=frames, num_inference_steps=30,
                      guidance_scale=5.0, generator=torch.Generator(device='cuda').manual_seed(seed)).frames[0]
    export_to_video(result, str(video_raw), fps=16)
    target_w, target_h = (720, 1280) if vertical else (1280, 720)
    # Upscaling to 720p is packaging, not a claim that the model natively resolved at 720p.
    command = ['ffmpeg', '-y', '-v', 'error', '-i', str(video_raw), '-t', str(duration),
               '-vf', f'fps=24,scale={target_w}:{target_h}:flags=lanczos,format=yuv420p',
               '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-movflags', '+faststart', str(video_final)]
    subprocess.run(command, check=True, timeout=300)
    require(video_final.is_file() and video_final.stat().st_size > 1000, 'wan_final_video_missing')
    receipt = {
        'schema': 'evercraft.local-video.worker-receipt.v1',
        'jobId': request['jobId'], 'modelId': request['modelId'],
        'weightsSha256': request['weightsSha256'], 'workerBuildDigest': request['workerBuildDigest'],
        'modelLicenseId': request['modelLicenseId'], 'continuityDigest': request['continuityDigest'],
        'localInference': True, 'artifactSha256': sha256_file(video_final),
        'modelFamily': 'wan2.1-t2v-1.3b', 'seed': seed, 'generatedFrameCount': frames,
        'nativeResolution': [width, height], 'deliveryResolution': [target_w, target_h],
        'publicationAuthority': False,
    }
    (output / 'worker-receipt.json').write_text(json.dumps(receipt, sort_keys=True, indent=2) + '\n')


if __name__ == '__main__':
    main()
