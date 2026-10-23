#!/usr/bin/env python3
"""Offline pinned Laser Foundry V2 source extraction, no code execution."""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import sys
import tempfile
import zipfile

PINNED_SHA256='bef6b86a0494b04f6823928e5f784c100f188b4aba51f363fe6a4e55e9e6b151'
MANIFEST={
 'LaserFoundryStudio/LAUNCH_LINUX.sh',
 'LaserFoundryStudio/LAUNCH_WINDOWS.cmd',
 'LaserFoundryStudio/README.md',
 'LaserFoundryStudio/engine.py',
 'LaserFoundryStudio/index.html',
 'LaserFoundryStudio/personalized.json',
 'LaserFoundryStudio/requirements.txt',
 'LaserFoundryStudio/showcase.json',
 'LaserFoundryStudio/studio.py',
 'LaserFoundryStudio/test_studio.py',
 'LOCAL_VERIFICATION.json',
 'READ_ME_FIRST.txt',
}
def install(archive:Path,destination:Path,expected_sha:str=PINNED_SHA256)->dict:
    archive=Path(archive).expanduser()
    destination=Path(destination).expanduser()
    if not archive.is_file() or archive.is_symlink() or archive.stat().st_size>2_000_000:
        raise ValueError('archive_missing_or_untrusted_size')
    digest=hashlib.sha256(archive.read_bytes()).hexdigest()
    if digest!=expected_sha:raise ValueError('archive_sha256_pin_mismatch')
    if destination.exists() or destination.is_symlink():
        raise ValueError('destination_already_exists_no_implicit_overwrite')
    parent=destination.parent
    if any(ancestor.is_symlink() for ancestor in (parent,*parent.parents)):
        raise ValueError('destination_symlink_ancestor_denied')
    if parent.exists() and not parent.is_dir():
        raise ValueError('destination_parent_unsafe')
    parent.mkdir(mode=0o700,parents=True,exist_ok=True)
    with zipfile.ZipFile(archive) as z:
        members=z.infolist()
        names=[m.filename for m in members]
        if len(set(names))!=len(names) or set(names)!=MANIFEST:
            raise ValueError('archive_manifest_not_exact_allowlist')
        total=0
        for info in members:
            name=info.filename
            rel=Path(name)
            if rel.is_absolute() or '\\' in name or '..' in rel.parts or info.is_dir():
                raise ValueError('archive_path_traversal_or_directory_rejected')
            mode=info.external_attr>>16
            if stat.S_IFMT(mode) not in (0,stat.S_IFREG):
                raise ValueError('archive_non_regular_entry_denied')
            total+=info.file_size
            if info.file_size>2_000_000 or (info.compress_size<=0 and info.file_size>0):
                raise ValueError('archive_entry_size_invalid')
            if info.compress_size and info.file_size/info.compress_size>100:
                raise ValueError('archive_compression_ratio_denied')
        if total>4_000_000:raise ValueError('archive_total_size_invalid')
        tmp=Path(tempfile.mkdtemp(prefix='.laser-foundry-checked-',dir=str(parent)))
        try:
            for info in members:
                target=tmp.joinpath(*Path(info.filename).parts)
                target.parent.mkdir(parents=True,exist_ok=True)
                data=z.read(info)
                if len(data)!=info.file_size:raise ValueError('archive_entry_length_invalid')
                target.write_bytes(data)
                target.chmod(0o600)
            os.replace(tmp,destination)
        except Exception:
            shutil.rmtree(tmp,ignore_errors=True)
            raise
    receipt={
        'schema':'evercraft.nextgen.laser-foundry-install.v1',
        'package_id':'evercraft-laser-foundry-v2-pinned',
        'archive_sha256':digest,
        'file_count':len(members),
        'extracted_bytes':total,
        'source_extracted_only':True,
        'python_dependencies_installed':False,
        'service_started':False,
        'remote_device_enrolled':False,
        'owner_approval_granted_by_this_script':False,
    }
    (destination/'NEXTGEN_INSTALL_RECEIPT.json').write_text(json.dumps(receipt,indent=2)+'\n')
    return receipt
if __name__=='__main__':
    if len(sys.argv)!=1:raise SystemExit('No runtime path overrides are permitted')
    home=Path.home()
    source=home/'.local/share/evercraft/staging/laser-foundry-v2-approved.zip'
    target=home/'.local/share/evercraft/apps/laser-foundry-v2'
    print(json.dumps(install(source,target),indent=2))
