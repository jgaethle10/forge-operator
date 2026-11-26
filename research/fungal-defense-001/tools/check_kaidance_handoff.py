#!/usr/bin/env python3
"""Validate source-only Fungal Defense handoff to the *existing* Kaidance clock.

This is neither a Systemia private mission export nor evidence of live
admission, deployment, worker execution or scientific validation.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import re

ROOT=Path(__file__).resolve().parent.parent
FILE=ROOT/"kaidance-research-handoff.v1.json"

def verify(d:object,root:Path=ROOT)->list[str]:
    issues=[]
    def need(test:bool,reason:str)->None:
        if not test:issues.append(reason)
    if not isinstance(d,dict):return ["handoff_not_object"]
    need(d.get("schema")=="evercraft.systemia.rd-source-handoff.v1","wrong_schema")
    need(d.get("project_key")=="FUNGAL-DEFENSE-001","wrong_identity")
    for key,expected in (
      ("originating_issue","https://github.com/jgaethle10/forge-operator/issues/1834"),
      ("source_review_pr","https://github.com/jgaethle10/forge-operator/pull/1908"),
      ("kaidance_continuity_pr","https://github.com/jgaethle10/forge-operator/pull/2588"),
      ("canonical_continuity_issue","https://github.com/jgaethle10/forge-operator/issues/1426"),
    ):need(d.get(key)==expected,"wrong_reference_"+key)
    a=d.get("authority")
    if not isinstance(a,dict):return issues+["authority_missing"]
    need(a.get("systemia_mission_admission")=="not_verified","admission_claim_without_receipt")
    need(a.get("authoritative_private_mission_id") is None,"private_id_must_not_be_in_public_source")
    need(a.get("authoritative_owner") is None,"private_owner_must_not_be_in_public_source")
    need(a.get("current_state")=="candidate_source_handoff_only","source_must_not_claim_runtime")
    for key in ("no_new_scheduler","use_existing_company_heartbeat","heartbeat_reconciles_not_research_execution",
                "private_export_required","no_auto_admission","no_automatic_work_dispatch",
                "no_public_health_alerts","no_automatic_source_revision","no_publication",
                "no_clinical_decision_support","no_pathogen_experiments"):
        need(a.get(key) is True,"unsafe_authority_"+key)
    need(a.get("cadence_seconds")==300,"wrong_heartbeat_cadence")
    c=d.get("cadence_policy",{})
    need(c.get("liveness_seconds")==300,"wrong_liveness_cadence")
    need(type(c.get("full_source_review_minimum_seconds")) is int and
         c["full_source_review_minimum_seconds"]>=86400,"source_review_reruns_too_frequently")
    need(c.get("on_missing_receipt")=="hold_and_raise_private_exception_no_false_progress",
         "missing_receipt_false_green")
    need(c.get("on_unknown_mission_identity")=="do_not_promote_proposed_source_into_admitted_ledger",
         "unapproved_mission_promotion")
    e=d.get("existing_evidence",{})
    if not isinstance(e,dict):return issues+["evidence_missing"]
    need(e.get("last_work_execution_receipt")=="unverified_on_evercraft_owned_node",
         "fake_owned_node_receipt")
    need(e.get("last_private_systemia_goal_checkpoint")=="not_provided","fake_goal_state")
    need(e.get("research_advanced_this_tick") is False,"fake_five_minute_research_advancement")
    for key in ("latest_observatory","versioned_historical_data","dated_revised_annual_data",
                "separate_provisional_data","local_validation_runner","local_handoff_script",
                "editorial_factcheck"):
        value=e.get(key,"")
        need(isinstance(value,str) and
             bool(re.fullmatch(r"research/fungal-defense-001/[A-Za-z0-9_./-]+",value)) and
             ".." not in value and (root.parent/value).is_file(),
             "source_artifact_missing_"+key)
    nxt=d.get("bounded_next_action",{})
    need(nxt.get("authorized_to_execute") is False and
         nxt.get("requires_operator_authorization") is True and
         nxt.get("source_evidence_only") is True,"unauthorized_automatic_action")
    need(isinstance(nxt.get("description"),str) and
         "Systemia" in nxt["description"] and len(nxt["description"])<=1200,
         "missing_systemia_reconciliation")
    return issues

def main()->int:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--file",type=Path,default=FILE)
    args=parser.parse_args()
    try:issues=verify(json.loads(args.file.read_text("utf-8")))
    except (OSError,ValueError,TypeError,KeyError) as exc:
        issues=["source_read_failed:"+type(exc).__name__]
    if issues:
        print("HOLD: "+", ".join(issues))
        return 2
    print("PASS: source-only Kaidance research handoff is valid; admission and runtime UNVERIFIED")
    return 0

if __name__=="__main__":
    raise SystemExit(main())
