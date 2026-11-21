"""Synthetic-only tests for authenticated live Revenue Desk review projection."""
import unittest
from server import project_source_review


class SourceReviewTests(unittest.TestCase):
    def test_reported_send_stays_unverified(self):
        x = [{
            'id': 1, 'business': 'Private Bakery', 'buyer': 'Jane',
            'pain': 'Need ordering site', 'source': 'public-post-123',
            'signal': 'Original quote', 'sent': [{
                'to': 'jane@private.invalid', 'subject': 'Proposal',
                'body': 'message', 'secret_key': 'not allowed'
            }], 'status': 'sent', 'followup': '2026-11-18'
        }]
        result = project_source_review(x)
        self.assertEqual(result['count'], 1)
        self.assertEqual(result['records'][0]['tier'], 'due_named_buyer_review')
        self.assertEqual(result['records'][0]['sent_history'][0]['to'], 'jane@private.invalid')
        self.assertEqual(result['delivery_verified'], 0)
        self.assertFalse(result['records'][0]['outreach_approved'])
        self.assertNotIn('secret_key', str(result))
        self.assertNotIn('not allowed', str(result))

    def test_malformed_and_limit(self):
        self.assertEqual(project_source_review([None])['records'][0]['tier'], 'schema_review')
        with self.assertRaises(ValueError):
            project_source_review([{}] * 501)


if __name__ == '__main__':
    unittest.main()
