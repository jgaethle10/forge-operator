#!/usr/bin/env python3
"""Kaidance -> Revenue Desk review envelope. No transport or contact authority."""
import argparse
import datetime as dt
import hashlib
import importlib.util
import json
import os
import pathlib
import re
import stat
import sys
import sqlite3
import tempfile

SCHEMA="evercraft.findmypart.queue-review-envelope.v1"
QUEUE="evercraft.kaidance.company-heartbeat.queue.v1"
REPORT="evercraft.findmypart.execution-cycle.v1"
HASH=re.compile(r"sha256:[a-f0-9]{64}\Z")
MAX=256*1024
DAY=86400

def adapter():
    spec=importlib.util.spec_from_file_location("desk_shadow",pathlib.Path(__file__).with_name("findmypart-desk-shadow-review.py"))
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def utc(value):
    result=dt.datetime.fromisoformat(value.replace("Z","+00:00"))
    if result.tzinfo is None:
        raise ValueError("naive_timestamp")
    return result.timestamp()

def digest(value):
    return "sha256:"+hashlib.sha256(json.dumps(value,sort_keys=True,separators=(",",":"),ensure_ascii=True).encode()).hexdigest()

def read_private(file):
    file=pathlib.Path(file)
    if not file.is_absolute() or file.resolve(strict=True)!=file:
        raise ValueError("receipt_path")
    with os.fdopen(os.open(file,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK),"rb") as f:
        s=os.fstat(f.fileno())
        if not stat.S_ISREG(s.st_mode) or s.st_uid!=os.getuid() or s.st_mode&0o077 or s.st_size>MAX:
            raise ValueError("receipt_permissions")
        raw=f.read(MAX+1)
    if len(raw)>MAX:
        raise ValueError("receipt_size")
    return json.loads(raw)

def export_review(queue,execution,now):
    if queue.get("schema")!=QUEUE or queue.get("execution_authorized") is not False or execution.get("schema")!=REPORT or execution.get("outreach_authorized") is not False or execution.get("buyers_qualified")!=0:
        raise ValueError("source_contract")
    at=utc(queue["observed_at"])
    if not 0<=now-at<=900 or execution.get("tick")!=int(at//300) or abs(utc(execution["observed_at"])-at)>120:
        raise ValueError("source_clock")
    source=execution["service_fit_candidates"]
    if not isinstance(source,list) or len(source)>6:
        raise ValueError("source_count")
    by_key={}
    for row in source:
        k=row["work_key"]
        if k in by_key or row.get("buyer_need_confirmed") is not False or row.get("outreach_authorized") is not False or not HASH.fullmatch(row.get("body_digest","")) or not 0<=at-utc(row["observed_at"])<=DAY:
            raise ValueError("source_row")
        by_key[k]=row
    selected=[]
    seen=set()
    for row in queue["candidates"]:
        k=row.get("work_key","")
        if not isinstance(k,str) or not k.startswith("findmypart:shop:"):
            continue
        ev=by_key.get(k)
        if k in seen or not ev or row.get("lane_key")!="findmypart" or row.get("priority")!=1 or row.get("action")!="reconcile_existing_revenue_desk_then_confirm_actual_stalled_case" or row.get("authority")!="systemia_operator_review_required" or row.get("execution_authorized") is not False or row.get("outreach_authorized") is not False or row.get("buyer_need_confirmed") is not False or row.get("evidence_ref")!=ev["body_digest"] or any(row.get(f)!=ev.get(f) for f in ("business_name","source_url","observed_at")):
            raise ValueError("queue_evidence_mismatch")
        seen.add(k)
        selected.append({f:row[f] for f in ("work_key","business_name","source_url")})
    if seen!=set(by_key):
        raise ValueError("queue_coverage")
    if selected:
        list(adapter().parse_candidates(selected))
    payload={"schema":SCHEMA,"source_tick":execution["tick"],"observed_at":queue["observed_at"],
             "source_authority":"local_receipt_pair_unverified_transport","candidates":selected,
             "contact_clearance":False,"outreach_authorized":False}
    return {**payload,"payload_digest":digest(payload)}

def import_review(envelope,db,now):
    payload=dict(envelope)
    claimed=payload.pop("payload_digest",None)
    if set(payload)!={"schema","source_tick","observed_at","source_authority","candidates","contact_clearance","outreach_authorized"} or claimed!=digest(payload) or payload["schema"]!=SCHEMA or payload["source_authority"]!="local_receipt_pair_unverified_transport" or payload["contact_clearance"] is not False or payload["outreach_authorized"] is not False:
        raise ValueError("envelope_contract")
    at=utc(payload["observed_at"])
    if not 0<=now-at<=900 or payload["source_tick"]!=int(at//300):
        raise ValueError("envelope_clock")
    if payload["candidates"]==[]:
        return {"schema":"evercraft.findmypart.queue-desk-handoff.v1","state":"no_candidates","source_tick":payload["source_tick"],"source_digest":claimed,"transport_authenticated":False,"contact_clearance":False,"outreach_authorized":False}
    report=adapter().review(db,payload["candidates"])
    return {**report,"source_tick":payload["source_tick"],"source_digest":claimed,"transport_authenticated":False}

def self_test():
    at="2026-11-26T23:20:00Z"
    now=utc(at)
    row={"work_key":"findmypart:shop:example","business_name":"Example Repair","source_url":"https://example.com/parts","observed_at":at,"body_digest":"sha256:"+"a"*64,"buyer_need_confirmed":False,"outreach_authorized":False}
    execution={"schema":REPORT,"tick":int(now//300),"observed_at":at,"outreach_authorized":False,"buyers_qualified":0,"service_fit_candidates":[row]}
    q={**row,"lane_key":"findmypart","priority":1,"action":"reconcile_existing_revenue_desk_then_confirm_actual_stalled_case","authority":"systemia_operator_review_required","execution_authorized":False,"evidence_ref":row["body_digest"]}
    queue={"schema":QUEUE,"observed_at":at,"execution_authorized":False,"candidates":[q]}
    result=export_review(queue,execution,now)
    assert len(result["candidates"])==1 and result["outreach_authorized"] is False
    assert "body_digest" not in json.dumps(result)
    for bad_queue,bad_execution,bad_time in [
        ({**queue,"candidates":[{**q,"evidence_ref":"sha256:"+"b"*64}]},execution,now),
        ({**queue,"candidates":[q,q]},execution,now),
        (queue,execution,now+901),
        (queue,{**execution,"service_fit_candidates":[]},now)]:
        try:
            export_review(bad_queue,bad_execution,bad_time)
        except ValueError:
            continue
        raise AssertionError("invalid source accepted")
    try:
        import_review({**result,"outreach_authorized":True},None,now)
    except ValueError:
        pass
    else:
        raise AssertionError("changed envelope accepted")
    # Exercise a complete paired-receipt export -> serialized envelope ->
    # real SQLite read, not merely validation of a fabricated candidate array.
    with tempfile.TemporaryDirectory() as temp:
        db=pathlib.Path(temp)/"desk.sqlite3"
        with sqlite3.connect(db) as c:
            c.execute("CREATE TABLE opportunities(id INTEGER,external_id TEXT,body TEXT)")
            c.execute("CREATE TABLE sent(id INTEGER,opportunity_id INTEGER,body TEXT,recorded_at TEXT)")
            c.execute("INSERT INTO opportunities VALUES(1,'fixture',?)",(json.dumps({"business":"Example Repair"}),))
            c.execute("INSERT INTO sent VALUES(1,1,?,'fixture')",(json.dumps({"recipient":"buyer@example.com"}),))
        before=db.read_bytes()
        decoded=json.loads(json.dumps(result))
        received=import_review(decoded,db,now+1)
        assert received["source_digest"]==result["payload_digest"]
        assert received["source_tick"]==result["source_tick"]
        assert received["candidates"][0]["sent_matches"]==1
        assert received["transport_authenticated"] is False
        assert received["contact_clearance"] is False
        assert received["outreach_authorized"] is False
        assert "buyer@example.com" not in json.dumps(received)
        assert db.read_bytes()==before
        try:
            import_review(decoded,db,now+901)
        except ValueError:
            pass
        else:
            raise AssertionError("stale envelope accepted")
    print(json.dumps({"self_test":"passed","synthetic_only":True,"paired_receipt_to_sqlite":True}))

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--export-root",type=pathlib.Path)
    p.add_argument("--db",type=pathlib.Path)
    p.add_argument("--self-test",action="store_true")
    a=p.parse_args()
    if a.self_test:
        self_test()
        return
    try:
        now=dt.datetime.now(dt.timezone.utc).timestamp()
        if a.export_root and not a.db:
            root=a.export_root
            result=export_review(read_private(root/"queue.json"),read_private(root/"findmypart-execution/latest.json"),now)
        elif a.db and not a.export_root:
            raw=sys.stdin.read(MAX+1)
            if len(raw)>MAX:
                raise ValueError("input_limit")
            result=import_review(json.loads(raw),a.db,now)
        else:
            raise ValueError("choose_export_or_import")
        print(json.dumps(result,indent=2))
    except (OSError,ValueError,TypeError,KeyError,AttributeError,RecursionError):
        print(json.dumps({"schema":SCHEMA,"state":"hold_invalid_or_unavailable_input","contact_clearance":False,"outreach_authorized":False}))
        sys.exit(1)

if __name__=="__main__":
    main()
