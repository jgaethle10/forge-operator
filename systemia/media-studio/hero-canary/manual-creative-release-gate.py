#!/usr/bin/env python3
"""Fail-closed manual creative acceptance gate for Fallen Studios.
Does NOT evaluate beauty with AI or turn a technical decode into artistic approval.
A real human must fill the evidence with identifiable physical proof.
"""
import argparse,hashlib,json,pathlib,sys
def review(d):
    fail=[]
    if d.get("schema")!="evercraft.fallen.manual-creative-review.v1":fail.append("wrong_schema")
    if d.get("review_type")!="human":fail.append("human_review_missing")
    if d.get("artifact_sha256") is None or len(str(d["artifact_sha256"]))!=64:fail.append("exact_output_hash_missing")
    if not d.get("actual_preview_inspected"):fail.append("shot_not_visually_inspected")
    ratings=d.get("ratings") or {}
    for key in ("subject_clarity","image_composition","motion_believability","sound_design","commercial_relevance"):
        val=ratings.get(key)
        if type(val) is not int or val<4 or val>5:fail.append("low_or_unrated_"+key)
    if not d.get("sources_and_rights_verified"):fail.append("footage_rights_unverified")
    if not d.get("approved_brand_assets_used"):fail.append("brand_assets_unverified")
    if not d.get("actual_target_device_playback_confirmed"):fail.append("device_playback_unverified")
    if not d.get("customer_release_authorized"):fail.append("customer_release_not_authorized")
    if not d.get("owner_final_approval"):fail.append("owner_approval_missing")
    if not d.get("human_reviewer") or not d.get("reviewed_at_utc"):fail.append("human_review_receipt_missing")
    if not d.get("source_evidence_uris") or not d.get("media_evidence_uri"):fail.append("review_evidence_missing")
    return {"schema":"evercraft.fallen.manual-creative-release-gate.v1",
            "status":"ELIGIBLE_FOR_PUBLICATION_REVIEW" if not fail else "HOLD",
            "blockers":fail,
            "note":"Manual assertions and provenance must still be independently verified; this is not automatic artistic approval or a publication action.",
            "publication_triggered":False}
def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--review",required=True)
    ap.add_argument("--output",required=True)
    ap.add_argument("--expect-hold",action="store_true",help="For tests only: require a blocked release")
    args=ap.parse_args()
    d=json.loads(pathlib.Path(args.review).read_text())
    result=review(d)
    path=pathlib.Path(args.output)
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(result,indent=2)+"\n")
    print(json.dumps(result,indent=2))
    if args.expect_hold:
        sys.exit(0 if result["status"]=="HOLD" else 2)
    sys.exit(0 if result["status"]=="ELIGIBLE_FOR_PUBLICATION_REVIEW" else 2)
if __name__=="__main__":main()
