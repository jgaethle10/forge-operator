import datetime as dt
import json
import unittest

from revenue_desk_triage import build_triage, is_due, safe_status


class TriageTests(unittest.TestCase):
    def test_privacy_and_counts(self):
        rows = [
            {'id': 1, 'business': 'Secret Bakery', 'buyer': 'Jane Private', 'contact': 'private@example.org',
             'pain': 'Website conversion problem', 'signal': 'Jane needs help with conversion',
             'source': 'private-thread-123', 'status': 'replied', 'sent': [{'to': 'private@example.org'}],
             'reply': 'Ask me next Thursday', 'followup': '2026-11-17', 'paid_reference': 'PAY-SECRET'},
            {'id': 2, 'business': 'Secret Bakery', 'pain': 'Late deliveries', 'status': 'mystery-private-value',
             'sent': [], 'permission': 'unverified yes'},
            {'id': 3, 'business': 'Third Company', 'pain': 'Need site plan', 'status': 'drafted',
             'sent': [{'message': 'text'}, 'nonempty', {}], 'objection': 'Costs too much'},
        ]
        out = build_triage(rows, dt.date(2026, 11, 19))
        self.assertEqual(out['rows'], 3)
        self.assertEqual(out['structurally_eligible'], 3)
        self.assertEqual(out['prior_contact_flags'], 2)
        self.assertEqual(out['reported_sent_entries'], 3)
        self.assertEqual(out['sent_entries_per_record'], {'0': 1, '1': 1, '2-3': 1, '4+': 0})
        self.assertEqual(out['source_context_counts']['reply_reported_unverified'], 1)
        self.assertEqual(out['source_context_counts']['followup_due_from_source_unconfirmed'], 1)
        self.assertEqual(out['duplicate_business_name_rows_possible'], 1)
        text = json.dumps(out)
        for private in ('Jane Private', 'private@example.org', 'Secret Bakery', 'PAY-SECRET', 'mystery-private-value', 'Jane needs help'):
            self.assertNotIn(private, text)
        self.assertEqual(out['provider_deliveries_verified'], 0)
        self.assertEqual(out['verified_payments'], 0)

    def test_no_sent_not_treated_as_delivery(self):
        rows = [{'id': 4, 'business': 'Acme', 'pain': 'Needs appointment system', 'sent': [], 'status': 'contacted'}]
        out = build_triage(rows)
        self.assertEqual(out['prior_contact_flags'], 1)
        self.assertEqual(out['source_context_counts']['contact_stage_without_sent_entries'], 1)
        self.assertEqual(out['reported_sent_entries'], 0)

    def test_unknown_status_and_due_dates(self):
        self.assertEqual(safe_status('Personal Info Goes Here'), 'other_or_empty')
        self.assertTrue(is_due('2026-11-19T00:20:00Z', dt.date(2026,11,19)))
        self.assertFalse(is_due('not-a-date', dt.date(2026,11,19)))
        self.assertFalse(is_due('2026-11-20', dt.date(2026,11,19)))

    def test_invalid_rows(self):
        out = build_triage([{'id': 1, 'business': 'Acme', 'pain': 'Need quotes'}, None])
        self.assertEqual(out['rows'], 2)
        self.assertEqual(out['structurally_eligible'], 1)
        self.assertEqual(out['needs_schema_review'], 1)

if __name__ == '__main__':
    unittest.main()