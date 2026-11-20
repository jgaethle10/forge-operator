"""Demand Command action queue: synthetic data only, no contacts exposed."""
import datetime as dt
import json
import unittest
from revenue_desk_action_queue import build_queue, due_date, inspect_sent

class ActionQueueTests(unittest.TestCase):
    def test_cohort_priority(self):
        rows = [
            {'business': 'Private A', 'buyer':'Jane Doe', 'contact':'private@example.org', 'id':1, 'pain':'Wait list', 'source':'thread-uuid-A', 'status':'sent', 'followup':'2026-11-18', 'sent':[{'message_id':'private-id', 'to':'private@example.org'}]},
            {'business':'Private B','id':2,'pain':'No payment system','source':'thread-uuid-B','status':'sent','followup':'2026-11-25','sent':['sent receipt not verified']},
            {'business':'Private C','id':3,'pain':'No booking','source':'thread-uuid-C','status':'sent','followup':'2026-11-19','sent':[{'timestamp':'private 2026','body':'secret-body','status':'queued'}]},
            {'business':'Private D','buyer':'Mark Secret','id':4,'pain':'Need ads','source':'thread-uuid-D','status':'sent','followup':'2026-11-19','sent':[{'channel':'email'}], 'reply':'I might buy'},
        ]
        report=build_queue(rows, dt.date(2026,11,19))
        self.assertEqual(report['source_rows'], 4)
        self.assertEqual(report['tier_counts']['reply_reconciliation_first'], 1)
        self.assertEqual(report['tier_counts']['due_named_buyer_review'], 1)
        self.assertEqual(report['tier_counts']['due_buyer_identification_review'], 1)
        self.assertEqual(report['tier_counts']['source_evidence_review'], 1)
        self.assertEqual(report['review_queue'][0]['row_ordinal_1_based'], 4)
        self.assertEqual(report['sent_structure_counts']['has_provider_reference_rows'], 1)
        self.assertEqual(report['sent_structure_counts']['events'], 4)
        for secret in ('Jane Doe','Private A','private@example.org','Mark Secret', 'thread-uuid-A', 'I might buy','secret-body'):
            self.assertNotIn(secret, json.dumps(report))
        self.assertEqual(report['outreach_approved'], 0)
        self.assertEqual(report['delivery_verified'], 0)

    def test_datetime_in_local_date(self):
        self.assertTrue(due_date('2026-11-19', dt.date(2026,11,19)))
        self.assertFalse(due_date('2026-11-20', dt.date(2026,11,19)))
        self.assertFalse(due_date('invalid', dt.date(2026,11,19)))

    def test_send_structure_never_claims_verified_delivery(self):
        sent = inspect_sent([{'provider_message_id':'ID', 'status':'delivered','to':'user@example.org'},'human-logged', {}, None])
        self.assertEqual(sent['events'], 2)
        self.assertEqual(sent['dict_entries'], 1)
        self.assertEqual(sent['string_entries'], 1)
        self.assertTrue(sent['has_provider_reference'])
        self.assertNotIn('ID', json.dumps(sent))
        self.assertNotIn('delivered', json.dumps(sent))
        self.assertNotIn('user@example.org', json.dumps(sent))

    def test_malformed_does_not_crash(self):
        rows=[{'id':1,'business':'X','pain':'Y','sent':[]},None]
        r=build_queue(rows,dt.date(2026,11,19))
        self.assertEqual(r['tier_counts']['schema_review'],1)
        self.assertEqual(r['source_rows'],2)

if __name__=='__main__':
    unittest.main()