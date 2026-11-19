"""Verify that outbox integrity auditing fails closed on tampered event data."""
import hashlib
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from outbox_audit import audit


class OutboxIntegrityTest(unittest.TestCase):
    def test_valid_and_tampered_events(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'site-planner.sqlite3'
            with sqlite3.connect(path) as db:
                db.executescript('''
                CREATE TABLE outbox (id TEXT,site_id TEXT,event_type TEXT,aggregate_id TEXT,payload_json TEXT,payload_sha256 TEXT,state TEXT,created_at TEXT,delivered_at TEXT);
                CREATE TABLE reports (id TEXT,site_id TEXT);
                CREATE TABLE orders (id TEXT,site_id TEXT,report_id TEXT,scenario_id TEXT);
                CREATE TABLE plans (id TEXT,site_id TEXT,report_id TEXT,order_id TEXT);
                INSERT INTO reports VALUES ('r1','s1');
                ''')
                payload=json.dumps({'site_id':'s1','report_id':'r1'},sort_keys=True,separators=(',',':'))
                digest=hashlib.sha256(payload.encode()).hexdigest()
                db.execute('INSERT INTO outbox VALUES (?,?,?,?,?,?,?,?,?)',('e1','s1','site.report.created.v1','r1',payload,digest,'pending','2026-11-19',None))
                db.commit()
                self.assertTrue(audit(path)['ok'])
                db.execute('UPDATE outbox SET payload_json=? WHERE id=?',(payload+' ', 'e1'))
                db.commit()
                result=audit(path)
                self.assertFalse(result['ok'])
                self.assertEqual(result['problems'][0]['problem'],'hash_mismatch')


if __name__ == '__main__':unittest.main()
