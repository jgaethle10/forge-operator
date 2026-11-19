"""Smoke checks for the imported owned server (no network, no external services)."""
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


class ServerSmokeTest(unittest.TestCase):
    def test_isolated_database_and_provenance(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.dict(os.environ, {'EVERCRAFT_SITE_DATA': tmp}):
                import importlib
                import sys
                sys.modules.pop('server', None)
                server = importlib.import_module('server')
                server.init()
                with server.connect() as db:
                    sid = 'SITE-A'
                    db.execute("""INSERT INTO sites
                      (id,address,status,created_at,updated_at)
                      VALUES (?,?,?,?,?)""", (sid,'Test address','draft',server.now(),server.now()))
                    db.execute("""INSERT INTO scenarios
                      (id,site_id,name,created_at) VALUES (?,?,?,?)""",
                      ('SCN-A',sid,'Baseline',server.now()))
                    report=server.newreport(db,sid)
                    self.assertEqual(report['site_id'],sid)
                    event=server.append_event(db,sid,'site.report.created.v1',report['id'],
                        {'site_id':sid,'report_id':report['id']})
                    self.assertTrue(event.startswith('EVENT-'))
                    db.commit()
                    row=db.execute('SELECT * FROM outbox WHERE id=?',(event,)).fetchone()
                    self.assertEqual(row['state'],'pending')
                    self.assertEqual(row['site_id'],sid)


if __name__ == '__main__':
    unittest.main()
