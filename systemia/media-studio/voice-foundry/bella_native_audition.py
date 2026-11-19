#!/usr/bin/env python3
"""Evercraft Voice Foundry: private, native Kokoro Bella audition.

Generates auditions, not release-approved customer audio. Uses native English
text synthesis, never substitute voices, edited phonemes or fabricated results.
Hugging Face offline mode makes missing weights fail closed.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path

VOICE = 'af_bella'
SAMPLE_RATE = 24_000


def checksum(path):
    h = hashlib.sha256()
    with open(path, 'rb') as src:
        for chunk in iter(lambda: src.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def audio_for_text(pipeline, text, *, seed):
    import numpy as np
    import torch
    torch.manual_seed(seed)
    chunks = []
    for result in pipeline(text, voice=VOICE, speed=1.0):
        audio = result.audio if hasattr(result, 'audio') else result[2]
        if hasattr(audio, 'detach'):
            audio = audio.detach().cpu().numpy()
        chunks.append(np.asarray(audio, dtype='float32').reshape(-1))
    if not chunks:
        raise RuntimeError('BELLA_NO_NATIVE_AUDIO')
    data = np.concatenate(chunks)
    duration = len(data) / SAMPLE_RATE
    if not np.isfinite(data).all() or np.max(np.abs(data)) < 0.002:
        raise RuntimeError('BELLA_SILENT_OR_INVALID_AUDIO')
    if np.max(np.abs(data)) >= 1.0:
        raise RuntimeError('BELLA_PEAK_CLIPPED')
    if duration < 0.3 or duration > 60:
        raise RuntimeError('BELLA_UNEXPECTED_DURATION')
    return data


def render_private_auditions(script_path, output_dir, pipeline, *, seed_base=73):
    import soundfile as sf
    script_path = Path(script_path).resolve()
    output = Path(output_dir).resolve()
    script = script_path.read_text(encoding='utf-8').strip()
    lines = [line.strip() for line in script.splitlines() if line.strip()]
    if not lines or len(lines) > 12 or len(script) > 2500:
        raise ValueError('SCRIPT_LENGTH_INVALID')
    if output == script_path.parent:
        raise ValueError('SEPARATE_PRIVATE_OUTPUT_DIR_REQUIRED')
    output.mkdir(parents=True, exist_ok=True)
    assets = []
    takes = [
        ('full_a', ' '.join(lines), seed_base),
        ('full_b', ' '.join(lines), seed_base + 1),
        *[(f'scene_{i + 1:02d}', line, seed_base + 10 + i)
          for i, line in enumerate(lines)]
    ]
    for label, text, seed in takes:
        audio = audio_for_text(pipeline, text, seed=seed)
        name = f'bella_{label}.wav'
        path = output / name
        sf.write(path, audio, SAMPLE_RATE, subtype='PCM_24')
        assets.append({
            'name': name, 'sha256': checksum(path), 'scriptText': text,
            'durationSec': round(len(audio) / SAMPLE_RATE, 3),
            'sampleRate': SAMPLE_RATE, 'seed': seed,
            'status': 'PRIVATE_AUDITION_UNREVIEWED'
        })
    receipt = {
        'schema': 'evercraft.voice-foundry.bella-audition.v1',
        'nativeVoiceId': VOICE, 'langCode': 'a', 'speed': 1.0,
        'scriptSha256': hashlib.sha256(script.encode('utf-8')).hexdigest(),
        'sourceScript': str(script_path),
        'generator': 'kokoro.KPipeline native text route',
        'modelWeightsDigestVerified': False,
        'modelFetchedDuringThisRun': False,
        'auditions': assets,
        'status': 'PENDING_OWNER_LISTENING_AND_SOURCE_ATTESTATION',
        'releaseAuthorized': False,
    }
    (output / 'bella_audition_receipt.json').write_text(
        json.dumps(receipt, indent=2) + '\n', encoding='utf-8')
    return receipt


def main():
    parser = argparse.ArgumentParser(description='Native local Bella audition')
    parser.add_argument('script', type=Path, help='Private UTF-8 scene lines')
    parser.add_argument('outdir', type=Path, help='Private output directory')
    parser.add_argument('--seed', type=int, default=73)
    args = parser.parse_args()
    os.environ['HF_HUB_OFFLINE'] = '1'
    os.environ['TRANSFORMERS_OFFLINE'] = '1'
    os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
    try:
        from kokoro import KPipeline
        pipeline = KPipeline(lang_code='a')
    except Exception as exc:
        raise SystemExit(
            'NATIVE_BELLA_LOCAL_RUNTIME_UNAVAILABLE: verify installed Kokoro '
            'and reviewed cached model/voice weights. No substitute allowed. '
            + str(exc)) from exc
    receipt = render_private_auditions(
        args.script, args.outdir, pipeline, seed_base=args.seed)
    print(json.dumps({
        'status': receipt['status'], 'count': len(receipt['auditions']),
        'receipt': str(args.outdir / 'bella_audition_receipt.json')
    }))


if __name__ == '__main__':
    main()
