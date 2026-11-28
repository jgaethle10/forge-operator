#!/usr/bin/env python3
"""Read-only, bounded Evercraft storage inventory. Never copies or deletes bytes."""
from __future__ import annotations

import argparse
import collections
import heapq
import json
import os
import pathlib
import stat
import time

# Explicit cache types only. No broad "tmp", archive, log or build auto-delete.
REBUILDABLE_CACHE_COMPONENTS = {
    ('.npm', '_cacache'),
    ('.cache', 'pip'),
    ('.cache', 'uv'),
}
# A positive protection rule always wins, including over a cache path.
PROTECTED_COMPONENTS = {
    '.git', '.ssh', 'releases', 'release', 'journal', 'journals',
    'core-supervisor', 'resident-config', 'database', 'databases',
    'state', 'runtime', 'backups', 'backup', 'keys', 'credentials',
    'secrets', 'private', 'ledger',
}
PROTECTED_SUFFIXES = {
    '.db', '.db-wal', '.db-shm', '.sqlite', '.sqlite3', '.journal',
    '.pem', '.key', '.p12', '.pfx', '.gpg', '.age',
}
REVIEW_COMPONENTS = {
    'engineering', 'temp', 'build', 'dist', 'cache', 'artifacts',
    'archive', 'archives', 'snapshots', 'cemetery',
}


def classify(path: pathlib.Path) -> str:
    parts = tuple(part.lower() for part in path.parts)
    name = path.name.lower()
    if any(part in PROTECTED_COMPONENTS for part in parts):
        return 'PRESERVE'
    if name.startswith(('.env', 'id_rsa', 'id_ed25519')) or any(
        name.endswith(ext) for ext in PROTECTED_SUFFIXES
    ):
        return 'PRESERVE'
    if any(parts[i:i + 2] in REBUILDABLE_CACHE_COMPONENTS
           for i in range(len(parts) - 1)):
        return 'REVIEW_REBUILDABLE_CACHE'
    if any(part in REVIEW_COMPONENTS for part in parts):
        return 'REVIEW_NOT_APPROVED'
    return 'PRESERVE_UNKNOWN'


def inventory(root: pathlib.Path, max_entries: int, max_seconds: float,
              max_depth: int, top: int) -> dict:
    if root.is_symlink() or not root.is_dir():
        raise ValueError('Root must be an existing, non-symlink directory')
    original_root = root.absolute()
    root_device = original_root.stat().st_dev
    deadline = time.monotonic() + max_seconds
    stack = [(original_root, 0)]
    counted = 0
    file_count = 0
    symlink_skips = 0
    mount_skips = 0
    inaccessible = 0
    categories = collections.defaultdict(lambda: {'files': 0, 'apparent_bytes': 0})
    parents = collections.defaultdict(int)
    largest = []
    partial = False
    while stack:
        if counted >= max_entries or time.monotonic() >= deadline:
            partial = True
            break
        folder, depth = stack.pop()
        try:
            entries = os.scandir(folder)
        except OSError:
            inaccessible += 1
            continue
        try:
            with entries:
                for entry in entries:
                    if counted >= max_entries or time.monotonic() >= deadline:
                        partial = True
                        break
                    counted += 1
                    try:
                        entry_stat = entry.stat(follow_symlinks=False)
                    except OSError:
                        inaccessible += 1
                        continue
                    if stat.S_ISLNK(entry_stat.st_mode):
                        symlink_skips += 1
                        continue
                    if entry_stat.st_dev != root_device:
                        mount_skips += 1
                        continue
                    path = pathlib.Path(entry.path)
                    if stat.S_ISDIR(entry_stat.st_mode):
                        # Never traverse protected VCS or credential folders.
                        if entry.name in ('.git', '.ssh'):
                            continue
                        if depth < max_depth:
                            stack.append((path, depth + 1))
                        else:
                            partial = True
                    elif stat.S_ISREG(entry_stat.st_mode):
                        file_count += 1
                        category = classify(path)
                        categories[category]['files'] += 1
                        categories[category]['apparent_bytes'] += entry_stat.st_size
                        relative = path.relative_to(original_root)
                        group = relative.parts[0] if relative.parts else '.'
                        parents[group] += entry_stat.st_size
                        row = (entry_stat.st_size, str(relative), category)
                        if len(largest) < top:
                            heapq.heappush(largest, row)
                        elif row > largest[0]:
                            heapq.heapreplace(largest, row)
        except OSError:
            inaccessible += 1
    return {
        'mode': 'READ_ONLY_NO_COPY_NO_DELETE',
        'root': str(original_root),
        'limits': {'seconds': max_seconds, 'entries': max_entries,
                   'depth': max_depth},
        'partial': partial, 'entries_examined': counted,
        'regular_files': file_count, 'skipped_symlinks': symlink_skips,
        'skipped_other_filesystems': mount_skips, 'unreadable_entries': inaccessible,
        'classification': dict(categories),
        'largest_files': [
            {'relative_path': path, 'apparent_bytes': size, 'category': category}
            for size, path, category in sorted(largest, reverse=True)
        ],
        'top_level_groups': [
            {'name': name, 'scanned_apparent_bytes': size}
            for name, size in sorted(parents.items(), key=lambda pair: -pair[1])[:top]
        ],
        'disclaimer': 'Partial apparent bytes only, not recoverable disk space. '
        'Btrfs compression/reflinks and open files affect reclaim. All candidates require '
        'operator review, independent verified backup when proprietary, and a separate '
        'approved removal process. This tool NEVER deletes or backs up anything.',
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=pathlib.Path, required=True,
                        help='one explicit directory to inspect (no whole-home default)')
    parser.add_argument('--seconds', type=float, default=8)
    parser.add_argument('--entries', type=int, default=2500)
    parser.add_argument('--depth', type=int, default=4)
    parser.add_argument('--top', type=int, default=12)
    args = parser.parse_args()
    if not (0 < args.seconds <= 20 and 0 < args.entries <= 10000 and
            0 <= args.depth <= 8 and 0 < args.top <= 50):
        parser.error('unsafe scan limits')
    try:
        result = inventory(args.root, args.entries, args.seconds,
                           args.depth, args.top)
    except (OSError, ValueError) as exc:
        parser.error(str(exc))
    print(json.dumps(result, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
