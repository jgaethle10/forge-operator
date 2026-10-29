#!/usr/bin/env python3
"""Verify and privately stage the original signed Evercraft Sovereign AI archive.

No network, sudo, systemd, installation into host /opt, model downloads or inference.
The original release installer runs only under a private EVERCRAFT_INSTALL_ROOT.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import zipfile

RELEASE = 'evercraft-ai-appliance-v0.2.0-node001-prealpha'
ARCHIVE_SHA = '7877493c46779aa66880139ca87f7155d6fc3ea5c9d8a4d1c5ca44731e8c1ca8'
KEY_FINGERPRINT = 'cb2024baa735e998c5726bf0bc9e82a754843d34dbab6e226f695c897ab2c9fa'
MAX_ARCHIVE_BYTES = 10_000_000
MAX_EXPANDED_BYTES = 60_000_000
MAX_MEMBERS = 90

def require(condition, detail):
    if not condition:
        raise ValueError(detail)

def filehash(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as stream:
        for chunk in iter(lambda: stream.read(65536), b''):
            digest.update(chunk)
    return digest.hexdigest()

def safe_extract(source, dst):
    with zipfile.ZipFile(source) as archive:
        entries = archive.infolist()
        require(len(entries) <= MAX_MEMBERS, 'archive_member_count_exceeded')
        require(sum(x.file_size for x in entries) <= MAX_EXPANDED_BYTES, 'expanded_size_exceeded')
        require(archive.testzip() is None, 'zip_crc_invalid')
        observed = set()
        for info in entries:
            name = info.filename
            path = PurePosixPath(name)
            require(not path.is_absolute() and '..' not in path.parts and '\\' not in name, 'unsafe_member_path')
            require(path.parts and path.parts[0] == RELEASE, 'unexpected_release_root')
            require(name not in observed, 'duplicate_member_name')
            observed.add(name)
            mode = info.external_attr >> 16
            require(not stat.S_ISLNK(mode), 'zip_symlink_rejected')
            kind = stat.S_IFMT(mode)
            require(kind in (0, stat.S_IFREG, stat.S_IFDIR), 'unsupported_archive_member_type')
            target = dst.joinpath(*path.parts)
            if info.is_dir():
                target.mkdir(mode=0o700, parents=True, exist_ok=True)
            else:
                require(info.file_size <= MAX_ARCHIVE_BYTES, 'oversize_member')
                target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                with archive.open(info) as input_file, target.open('xb') as out_file:
                    shutil.copyfileobj(input_file, out_file, 65536)
                target.chmod(0o755 if mode & 0o111 else 0o644)
    return dst / RELEASE

def attest(release):
    manifest = release / 'manifests/SHA256SUMS'
    signature = release / 'manifests/SHA256SUMS.sig'
    pub = release / 'keys/evercraft-node001-dev.pub.pem'
    require(manifest.is_file() and signature.is_file() and pub.is_file(), 'signed_manifest_missing')
    pkey = subprocess.run(['openssl', 'pkey', '-pubin', '-in', str(pub), '-outform', 'DER'],
                          capture_output=True, check=True)
    fingerprint = hashlib.sha256(pkey.stdout).hexdigest()
    require(fingerprint == KEY_FINGERPRINT, 'development_public_key_fingerprint_mismatch')
    signed = subprocess.run(['openssl', 'pkeyutl', '-verify', '-pubin', '-inkey', str(pub), '-rawin',
                             '-in', str(manifest), '-sigfile', str(signature)],
                            capture_output=True, check=False)
    require(signed.returncode == 0, 'manifest_signature_invalid')
    expected = {}
    for line in manifest.read_text().splitlines():
        match = re.fullmatch(r'([0-9a-f]{64})  \./([^\n]+)', line)
        require(match is not None, 'invalid_manifest_line')
        rel = PurePosixPath(match.group(2))
        require(not rel.is_absolute() and '..' not in rel.parts, 'unsafe_manifest_member')
        require(str(rel) not in expected, 'duplicate_manifest_member')
        expected[str(rel)] = match.group(1)
    require(len(expected) == 51, 'unexpected_manifest_count')
    for name, digest in expected.items():
        file = release.joinpath(*PurePosixPath(name).parts)
        require(file.is_file() and filehash(file) == digest, 'release_file_hash_mismatch:' + name)
    actual = {str(x.relative_to(release)) for x in release.rglob('*') if x.is_file()}
    require(actual == set(expected) | {'manifests/SHA256SUMS', 'manifests/SHA256SUMS.sig'},
            'unlisted_file_present')
    require((release/'VERSION').read_text().strip() == '0.2.0-node001-prealpha', 'wrong_release')
    require((release/'RELEASE_SEQUENCE').read_text().strip() == '2', 'wrong_sequence')
    return fingerprint, len(expected)

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('zip_file', type=Path, help='original signed release ZIP, not a tester kit')
    args = ap.parse_args()
    require(os.geteuid() != 0, 'do_not_run_as_root')
    source = args.zip_file.expanduser().resolve(strict=True)
    require(source.is_file() and source.stat().st_size <= MAX_ARCHIVE_BYTES,
            'unexpected_source_archive_size')
    source_sha = filehash(source)
    require(source_sha == ARCHIVE_SHA, 'outer_archive_sha256_mismatch')
    parent = Path.home()/'.local/state/evercraft/eo001-sovereign-staging'
    parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    parent.chmod(0o700)
    root = Path(tempfile.mkdtemp(prefix='verified-', dir=parent))
    try:
        release = safe_extract(source, root/'archive')
        fingerprint, count = attest(release)
        stage = root/'stage-root'
        stage.mkdir(mode=0o700)
        env = dict(os.environ)
        env['EVERCRAFT_INSTALL_ROOT'] = str(stage)
        result = subprocess.run(['bash', str(release/'install.sh')],cwd=release,env=env,
                                capture_output=True,text=True,timeout=30)
        require(result.returncode == 0,
                'private_stage_install_failed:' + (result.stderr or result.stdout).strip()[:500])
        require((stage/'opt/evercraft-ai/current/bin/evercraft-ai').is_file(),
                'staged_binary_missing')
        require((stage/'etc/evercraft-ai/trust/evercraft-release.pub.pem').is_file(),
                'staged_trust_missing')
        receipt = {'schema':'evercraft.sovereign-ai.hp-staged-release.v1',
                   'release':'0.2.0-node001-prealpha','archive_sha256':source_sha,
                   'signer_public_key_der_sha256':fingerprint,'manifest_file_count':count,
                   'signed_manifest_verified':True,'stage_root':str(stage),
                   'host_systemd_changed':False,'host_opt_modified':False,
                   'model_installed':False,'inference_performed':False,
                   'node002_agent_modified':False,
                   'state':'verified_staged_only_not_deployed'}
        receipt_file = root/'stage-receipt.json'
        receipt_file.write_text(json.dumps(receipt,indent=2)+'\n')
        receipt_file.chmod(0o600)
        print('EVERCRAFT_SOVEREIGN_STAGED: PASS')
        print('Signed 51-file release verified; no host services, model or production files touched.')
        print('Staged at:',stage)
        print('Receipt:',receipt_file)
    except BaseException:
        shutil.rmtree(root,ignore_errors=True)
        raise

if __name__ == '__main__':
    try: main()
    except (OSError,ValueError,subprocess.CalledProcessError,zipfile.BadZipFile,
            subprocess.TimeoutExpired) as exc:
        print('EVERCRAFT_SOVEREIGN_STAGED: BLOCKED '+str(exc),file=sys.stderr)
        sys.exit(1)
