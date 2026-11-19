#!/usr/bin/env python3
"""Read-only integrity and lineage audit for Site Planner's pending Systemia events."""
import argparse
import hashlib
import json
import sqlite3
from pathlib import Path


def audit(path):
    problems = []
    counts = {}
    conn = sqlite3.connect(f'file:{Path(path).resolve()}?mode=ro', uri=True)
    conn.row_factory = sqlite3.Row
    try:
        events = conn.execute('SELECT * FROM outbox ORDER BY created_at,id').fetchall()
        for event in events:
            event_id = event['id']
            counts[event['state']] = counts.get(event['state'], 0) + 1
            try:
                payload = json.loads(event['payload_json'])
            except (TypeError, ValueError):
                problems.append({'event_id': event_id, 'problem': 'invalid_json'})
                continue
            digest = hashlib.sha256(event['payload_json'].encode('utf-8')).hexdigest()
            if digest != event['payload_sha256']:
                problems.append({'event_id': event_id, 'problem': 'hash_mismatch'})
            if payload.get('site_id') != event['site_id']:
                problems.append({'event_id': event_id, 'problem': 'site_mismatch'})
            kind = event['event_type']
            if kind == 'site.plan.requested.v1':
                order = conn.execute('SELECT site_id,report_id,scenario_id FROM orders WHERE id=?', (event['aggregate_id'],)).fetchone()
                if not order or any(order[k] != payload.get(k) for k in ('site_id','report_id','scenario_id')):
                    problems.append({'event_id': event_id, 'problem': 'order_lineage_mismatch'})
                if payload.get('source_report_id'):
                    binding=conn.execute('SELECT os.site_id,os.source_report_id,sr.external_report_id FROM order_source_links os JOIN source_reports sr ON sr.id=os.source_report_id WHERE os.order_id=?',(event['aggregate_id'],)).fetchone()
                    if (not binding or binding['site_id']!=event['site_id']
                        or binding['source_report_id']!=payload.get('source_report_id')
                        or binding['external_report_id']!=payload.get('external_report_id')):
                        problems.append({'event_id':event_id,'problem':'order_source_report_lineage_mismatch'})
            elif kind == 'site.plan.registered.v1':
                plan = conn.execute('SELECT site_id,report_id,order_id FROM plans WHERE id=?', (event['aggregate_id'],)).fetchone()
                if not plan or any(plan[k] != payload.get(k) for k in ('site_id','report_id','order_id')):
                    problems.append({'event_id': event_id, 'problem': 'plan_lineage_mismatch'})
            elif kind == 'site.plan.status_changed.v1':
                action = conn.execute('SELECT site_id,order_id,previous_status,new_status,actor,reason FROM engineering_actions WHERE id=?', (payload.get('action_id'),)).fetchone()
                order = conn.execute('SELECT site_id,report_id FROM orders WHERE id=?', (event['aggregate_id'],)).fetchone()
                if (not action or not order or action['order_id'] != event['aggregate_id']
                    or any(action[k] != payload.get(v) for k,v in
                           [('site_id','site_id'),('previous_status','previous_status'),('new_status','status'),('actor','actor'),('reason','reason')])
                    or order['site_id'] != event['site_id'] or order['report_id'] != payload.get('report_id')):
                    problems.append({'event_id': event_id, 'problem': 'status_transition_lineage_mismatch'})
            elif kind == 'site.source_report.linked.v1':
                source = conn.execute('SELECT site_id,external_report_id,report_sha256,source_sha256 FROM source_reports WHERE id=?', (event['aggregate_id'],)).fetchone()
                if (not source or source['site_id'] != event['site_id']
                    or event['aggregate_id'] != payload.get('source_report_id')
                    or any(source[k] != payload.get(k) for k in ('external_report_id','report_sha256','source_sha256'))):
                    problems.append({'event_id': event_id, 'problem': 'source_report_lineage_mismatch'})
            elif kind == 'site.report.created.v1':
                report = conn.execute('SELECT site_id FROM reports WHERE id=?', (event['aggregate_id'],)).fetchone()
                if not report or report['site_id'] != payload.get('site_id'):
                    problems.append({'event_id': event_id, 'problem': 'report_lineage_mismatch'})
            else:
                problems.append({'event_id': event_id, 'problem': 'unknown_event_type'})
            if event['state'] == 'delivered' and not event['delivered_at']:
                problems.append({'event_id': event_id, 'problem': 'delivery_receipt_missing'})
        return {'ok': not problems, 'total_events': len(events), 'states': counts, 'problems': problems}
    finally:
        conn.close()


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('database', help='Path to site-planner.sqlite3')
    args = p.parse_args()
    result = audit(args.database)
    print(json.dumps(result, indent=2))
    raise SystemExit(0 if result['ok'] else 1)
