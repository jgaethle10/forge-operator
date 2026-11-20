#!/usr/bin/env python3
"""Content-addressed AIW mobile UX revision; no data or Caddy restart.

Use on Penguin as root:
  --prepare --ref <reviewed 40-char Git commit>
  --activate --ref <same commit>
The original national/WA dataset remains immutable and byte-identical.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import types

ORIGINAL_COMMIT="270291e8a8c3b32f10ca3f6dc47142e9e3542238"
ORIGINAL_ARCHIVE_SHA="47d8da45c45db533cad3556766195e077f62070bd683e5b90f120b01c32e16c7"
ROOT=Path("/srv/evercraft/infrastructure-watch")
OLD=ROOT/"releases"/(ORIGINAL_COMMIT+"-"+ORIGINAL_ARCHIVE_SHA[:12])
CURRENT=ROOT/"current"
REPO=Path("/home/jessegaethle10/.local/share/evercraft/forge-operator")
CONFIG=Path("/etc/evercraft/Caddyfile")
CONFIG_SHA="3b8ebe191ebe1009c1a59b10e79783678d998bc4ca13c22e82ead34c1dca9ef8"
HOST="fabric.systemiacommandcenters.com"
VIEW="research/infrastructure-watch/operator/aiw-state-first-private.html"
EXPORTER="research/infrastructure-watch/release/aiw_public_beta_bundle.py"
EXPECTED={
    "index.html","about.html","data/states.json","data/states.geojson",
    "data/wa-summary.json","data/wa-bridges.json",
    "vendor/leaflet.js","vendor/leaflet.css","vendor/LEAFLET-LICENSE",
    "vendor/US-ATLAS-LICENSE","robots.txt","release.json","SHA256SUMS",
}

def checksum(data):
    return hashlib.sha256(data).hexdigest()

def ensure(condition, message):
    if not condition:
        raise RuntimeError("STOP: "+message)

def read_files(root):
    ensure(root.is_dir() and not root.is_symlink(),"release directory not present")
    files={}
    for p in root.rglob("*"):
        ensure(not p.is_symlink(),"release contains a symlink")
        if p.is_file():
            name=p.relative_to(root).as_posix()
            ensure(name in EXPECTED,"unexpected release path "+name)
            files[name]=p.read_bytes()
    ensure(set(files)==EXPECTED,"incomplete or unexpected release contents")
    return files

def validate_files(files, expected_commit):
    manifest=json.loads(files["release.json"])
    ensure(manifest["schema"]=="evercraft.aiw.public-beta-static.v1","release schema drifted")
    ensure(manifest["source_commit"]==expected_commit,"wrong source commit in release manifest")
    ensure(manifest["wa_2026_total"]==8619 and manifest["wa_2026_poor"]==403,
           "Washington evidence changed")
    ensure(manifest["wa_2026_deep_records"]==8618 and manifest["national_state_summaries_2025"]==52,
           "national and Washington records changed")
    ensure(manifest["public_url_verified"] is False,"release declared unreviewed public URL verified")
    digests=manifest["files"]
    ensure(set(digests)==EXPECTED-{"release.json","SHA256SUMS"},"manifest membership drifted")
    for name,expected in digests.items():
        ensure(checksum(files[name])==expected,"release file hash mismatch: "+name)
    lines=files["SHA256SUMS"].decode("ascii").splitlines()
    want=[checksum(files[name])+"  "+name for name in sorted(EXPECTED-{"SHA256SUMS"})]
    ensure(lines==want,"SHA256SUMS changed or incomplete")
    return manifest

def git_blob(ref,path):
    proc=subprocess.run(
        ["git","-c",f"safe.directory={REPO}","-C",str(REPO),
         "show",f"{ref}:{path}"],
        stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=25)
    ensure(proc.returncode==0,"Git source at reviewed commit unavailable: "+path)
    return proc.stdout

def compile_revision(ref, baseline):
    old_exporter=git_blob(ORIGINAL_COMMIT,EXPORTER)
    new_exporter=git_blob(ref,EXPORTER)
    ensure(old_exporter==new_exporter,"exporter code changed: full re-review required")
    module=types.ModuleType("aiw_static_export")
    exec(compile(new_exporter,EXPORTER,"exec"),module.__dict__)
    old_html=module.static_page(git_blob(ORIGINAL_COMMIT,VIEW))
    ensure(old_html==baseline["index.html"],"live baseline HTML not identical to original verified export")
    new_html=module.static_page(git_blob(ref,VIEW))
    ensure(new_html!=old_html,"no mobile interaction change in reviewed commit")
    for marker in (
        b'id="map-selection"',b'id="show-state-details"',
        b'id="return-map"',b"if(isMobile()){",
        b"map.panTo(regionLayers.get(name).getBounds().getCenter()",
        b"if(again && selectedName===name && !deep && !isMobile())"):
        ensure(marker in new_html,"reviewed mobile UX element missing")
    ensure(b"if(isMobile())$('state-info').scrollIntoView" not in new_html,
           "old automatic mobile page jump remains")
    js=re.findall(rb"<script>(.*?)</script>",new_html,re.S)
    ensure(len(js)==1,"cannot identify exactly one inline map JS")
    with tempfile.NamedTemporaryFile(suffix=".js") as tmp:
        tmp.write(js[0]);tmp.flush()
        subprocess.run(["node","--check",tmp.name],check=True,timeout=12,
                       stdout=subprocess.DEVNULL)
    return new_html

def candidate(ref, previous, base_manifest, index):
    files=dict(previous)
    files["index.html"]=index
    manifest=dict(base_manifest)
    manifest["source_commit"]=ref
    manifest["source_origin"]="Immutable owned-edge federal data, reviewed mobile UI revision"
    manifest["generated_at_utc"]=datetime.now(timezone.utc).isoformat()
    manifest["ui_revision"]="mobile-calm-selection-2026-11-20"
    manifest["data_source_commit"]=ORIGINAL_COMMIT
    manifest["data_archive_sha256"]=ORIGINAL_ARCHIVE_SHA
    manifest["files"]=dict(manifest["files"])
    manifest["files"]["index.html"]=checksum(index)
    files["release.json"]=(json.dumps(manifest,sort_keys=True,separators=(",",":"))+"\n").encode()
    files["SHA256SUMS"]=("".join(
        checksum(files[name])+"  "+name+"\n" for name in sorted(EXPECTED-{"SHA256SUMS"})
    )).encode("ascii")
    validate_files(files,ref)
    # Every published data byte remains exactly the same as the original release.
    for name in EXPECTED-{"index.html","release.json","SHA256SUMS"}:
        ensure(files[name]==previous[name],"non-UI release file unexpectedly changed: "+name)
    return files

def directory_for(ref,index):
    return ROOT/"releases"/("mobile-"+ref[:12]+"-"+checksum(index)[:12])

def write_stage(dest,files):
    ensure(not dest.exists() and not dest.is_symlink(),"revision directory already exists")
    scratch=Path(tempfile.mkdtemp(prefix=".aiw-mobile-stage-",dir=ROOT/"releases"))
    try:
        for name,data in files.items():
            path=scratch/name
            path.parent.mkdir(parents=True,exist_ok=True)
            path.write_bytes(data)
            path.chmod(0o644)
        for p in scratch.rglob("*"):
            if p.is_dir():p.chmod(0o755)
        scratch.chmod(0o755)
        os.rename(scratch,dest)
    finally:
        if scratch.exists():shutil.rmtree(scratch)

def curl(path):
    return subprocess.run([
        "curl","--noproxy","*","--silent","--show-error","--fail","--insecure",
        "--max-time","10","--resolve",HOST+":8443:127.0.0.1",
        "https://"+HOST+":8443"+path
    ],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=12,check=True).stdout

def local_health():
    ensure(curl("/health"),"existing Fabric HTTPS health route unavailable")
    subprocess.run(["systemctl","is-active","--quiet","evercraft-public-edge.service"],
                   check=True,timeout=8)
    subprocess.run(["systemctl","is-active","--quiet","evercraft-fabric.service"],
                   check=True,timeout=8)

def link_to(path):
    ensure(path.is_dir() and not path.is_symlink(),"invalid release pointer")
    temp=ROOT/(".aiw-current-swap-"+str(os.getpid()))
    ensure(not temp.exists() and not temp.is_symlink(),"temporary symlink collision")
    try:
        os.symlink(str(path),temp)
        os.replace(temp,CURRENT)  # Atomic replacement of symlink, not its destination
    finally:
        if temp.is_symlink():temp.unlink()

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode",choices=["--prepare","--activate"])
    parser.add_argument("--ref",required=True)
    args=parser.parse_args()
    ref=args.ref
    ensure(os.geteuid()==0,"run as root on owned Penguin edge")
    ensure(re.fullmatch(r"[a-f0-9]{40}",ref),"pinned 40-character commit required")
    ensure(REPO.is_dir(),"canonical owned GitHub repo missing")
    ensure(CONFIG.is_file() and checksum(CONFIG.read_bytes())==CONFIG_SHA,
           "Caddy has changed since approved public beta release")
    ensure(CURRENT.is_symlink() and os.readlink(CURRENT)==str(OLD),
           "live AIW pointer no longer targets original verified release; no overwrite")
    local_health()
    old_files=read_files(OLD)
    orig_manifest=validate_files(old_files,ORIGINAL_COMMIT)
    new_index=compile_revision(ref,old_files)
    path=directory_for(ref,new_index)
    print("=== AIW MOBILE UX REVISION |",args.mode,"===")
    print("source_commit="+ref)
    print("original_release="+str(OLD))
    print("new_revision="+str(path))
    print("old_index_sha256="+checksum(old_files["index.html"]))
    print("new_index_sha256="+checksum(new_index))
    if args.mode=="--prepare":
        files=candidate(ref,old_files,orig_manifest,new_index)
        if path.exists():
            ensure(read_files(path)==files or (
                validate_files(read_files(path),ref) and
                read_files(path)["index.html"]==new_index
            ),"existing version differs")
            print("candidate_staged=ALREADY_PRESENT")
        else:
            write_stage(path,files)
            print("candidate_staged=NEW")
        print("live_symlink_unchanged=true")
        print("caddy_unchanged=true")
        print("NEXT: run --activate with the same reviewed commit")
        return

    staged=read_files(path)
    validate_files(staged,ref)
    ensure(staged["index.html"]==new_index,"staged mobile HTML differs from reviewed source")
    for name in EXPECTED-{"index.html","release.json","SHA256SUMS"}:
        ensure(staged[name]==old_files[name],"staged data or assets unexpectedly changed: "+name)
    # Never restart Caddy: static path pointer changes under the existing
    # validated file_server route. The exact prior target is retained.
    print("=== ATOMIC RELEASE SWITCH, NO CADDY RESTART ===")
    swapped=False
    try:
        link_to(path)
        swapped=True
        for url,file in (
            ("/infrastructure-watch/","index.html"),
            ("/infrastructure-watch/data/states.json","data/states.json"),
            ("/infrastructure-watch/data/states.geojson","data/states.geojson"),
            ("/infrastructure-watch/data/wa-summary.json","data/wa-summary.json"),
            ("/infrastructure-watch/data/wa-bridges.json","data/wa-bridges.json"),
            ("/infrastructure-watch/vendor/leaflet.js","vendor/leaflet.js"),
            ("/infrastructure-watch/vendor/leaflet.css","vendor/leaflet.css"),
        ):
            ensure(checksum(curl(url))==checksum(staged[file]),
                   "HTTPS byte verification failed: "+url)
            print("served_sha256_verified="+url)
        local_health()
        print("AIW_MOBILE_LOCAL_HTTPS=VERIFIED")
        print("CADDY_SERVICE_RESTARTED=false")
        print("PUBLIC_INTERNET_MOBILE_UX=REQUIRES_PHONE_CHECK")
    except BaseException:
        if swapped and CURRENT.is_symlink() and os.readlink(CURRENT)==str(path):
            link_to(OLD)
            print("original_release_symlink_restored=true",file=sys.stderr)
            try:local_health()
            except Exception:print("WARNING: verify original edge health manually",file=sys.stderr)
        raise

if __name__=="__main__":
    try:main()
    except Exception as error:
        print(str(error),file=sys.stderr)
        sys.exit(1)
