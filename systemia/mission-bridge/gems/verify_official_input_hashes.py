#!/usr/bin/env python3
"""Read-only GEMS organizer-file integrity verifier. No network or uploads.
Run: python3 verify_official_input_hashes.py /private/gems/data --receipt /private/gems/evidence/input-hashes.json
The SHA-256 values are recovered from the participant's preserved GEMS-001 archive.
Prefer authorized official DrivenData downloads; a matching hash alone is not a license.
"""
import argparse, hashlib, json, os
from pathlib import Path
EXPECTED={
 "example_submission.tif":"2176d08e485aa2cd2860ce8df539db4faf4d76163b38a4dd8c30a40454d35cbc",
 "existing_faults.tif":"7ba308ccdc4418b31a178f4f1ef21aaa6e152e4028f2f6f64b01f7eb25ae4093",
 "gems-geodawn-numerical-features.tif":"4371c82e3b8339b807bdffcf4ef59a225520fe2988d521be208ae33743123bc5"}
def verify(root):
 root=Path(root)
 report={"schema":"evercraft.gems.official-input-recovery.v1","state":"held",
         "source":"archived-GEMS-001-organizer-hashes","network_called":False,
         "model_trained":False,"submission_made":False,"files":{}}
 for name,expected in EXPECTED.items():
  p=root/name
  if not p.is_file() or p.is_symlink():
   report["files"][name]={"status":"missing_or_unsafe","expected_sha256":expected}
   continue
  h=hashlib.sha256()
  with p.open("rb") as f:
   for block in iter(lambda:f.read(4194304),b""):h.update(block)
  actual=h.hexdigest()
  report["files"][name]={"status":"verified" if actual==expected else "hash_mismatch",
                          "expected_sha256":expected,"actual_sha256":actual,
                          "bytes":p.stat().st_size}
 report["state"]="verified" if len(report["files"])==len(EXPECTED) and all(
  x["status"]=="verified" for x in report["files"].values()) else "held"
 return report
def main():
 a=argparse.ArgumentParser();a.add_argument("data_dir",type=Path);a.add_argument("--receipt",type=Path)
 opts=a.parse_args();result=verify(opts.data_dir)
 print(json.dumps(result,indent=2))
 if opts.receipt:
  opts.receipt.parent.mkdir(parents=True,exist_ok=True)
  fd=os.open(opts.receipt,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
  with os.fdopen(fd,"w") as fp:json.dump(result,fp,indent=2)
 raise SystemExit(0 if result["state"]=="verified" else 2)
if __name__=="__main__":main()
