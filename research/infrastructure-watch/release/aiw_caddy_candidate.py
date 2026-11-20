#!/usr/bin/env python3
"""Strict AIW Caddyfile candidate builder; never edits the running Caddyfile.

The only allowed edit is an exact, narrow path handler immediately before
Fabric's existing catch-all handle in the existing Fabric host block.
"""
import argparse
from pathlib import Path
import re

HOST = re.compile(r'(?m)^\{\$EVERCRAFT_PUBLIC_HOST\}[ \t]*\{[ \t]*$')
CATCHALL = re.compile(
    r'(?m)^(?P<indent>[ \t]+)handle[ \t]*\{[ \t]*\n'
    r'(?P=indent)[ \t]+reverse_proxy[ \t]+127\.0\.0\.1:8787[ \t]*\n'
    r'(?P=indent)\}[ \t]*$'
)
EXPECTED_MARKERS = (
    'redir /infrastructure-watch /infrastructure-watch/ 308',
    'handle_path /infrastructure-watch/* {',
    'root * /srv/evercraft/infrastructure-watch/current',
    'file_server'
)


def build_candidate(original: str, fragment: str) -> str:
    if not original.endswith("\n"):
        raise ValueError("Live Caddyfile must end with a newline")
    if "/infrastructure-watch" in original:
        raise ValueError("AIW route already mentioned in live Caddyfile")
    host_matches = list(HOST.finditer(original))
    if len(host_matches) != 1:
        raise ValueError("Fabric public site opener is missing or ambiguous")
    catchalls = list(CATCHALL.finditer(original))
    if len(catchalls) != 1:
        raise ValueError("Expected exact Fabric catchall not found once")
    host = host_matches[0]
    catchall = catchalls[0]
    next_site_close = re.search(r'(?m)^\}[ \t]*$', original[host.end():])
    if next_site_close is None:
        raise ValueError("Fabric host block is not balanced as expected")
    end = host.end() + next_site_close.end()
    if not host.start() < catchall.start() < end:
        raise ValueError("Catchall does not belong to Fabric public host")
    if "handle_path /home/*" not in original[host.end():end]:
        raise ValueError("Existing Home handler not found; route ownership drift")
    if len(re.findall(r'\bhandle[ \t]+/v1/remote/\*', original[host.end():end])) != 1:
        raise ValueError("Existing remote route not found; route ownership drift")
    if len(re.findall(r'\breverse_proxy[ \t]+127\.0\.0\.1:8787', original)) != 1:
        raise ValueError("Unexpected Fabric proxy count")
    if any(fragment.count(marker) != 1 for marker in EXPECTED_MARKERS):
        raise ValueError("Approved AIW fragment does not match narrow static route")
    if any(term in fragment for term in ("reverse_proxy", "basicauth", "basic_auth", "tls internal",
                                        "import ", "php_fastcgi", "forward_auth")):
        raise ValueError("AIW route must serve static files only")
    if re.search(r'(?m)^\s*(?:https?://|\{\$EVERCRAFT_PUBLIC_HOST\})', fragment):
        raise ValueError("AIW fragment must be site-local, not declare a host")
    indent = catchall.group('indent')
    localized = "\n".join(indent + line if line.strip() else "" for line in fragment.strip().splitlines())
    candidate = original[:catchall.start()] + localized + "\n\n" + original[catchall.start():]
    if candidate.replace(localized + "\n\n", "", 1) != original:
        raise ValueError("Candidate failed minimal-difference verification")
    return candidate


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True)
    parser.add_argument("--fragment", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    original = Path(args.source).read_text()
    fragment = Path(args.fragment).read_text()
    candidate = build_candidate(original, fragment)
    dest = Path(args.output)
    with dest.open("x", encoding="utf8") as stream:
        stream.write(candidate)
    dest.chmod(0o600)
    print("aiw_candidate_only=true")
    print("live_config_modified=false")


if __name__ == "__main__":
    main()
