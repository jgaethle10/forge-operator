"""Functional engineering queue transitions, event evidence, and cross-site isolation."""
import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import server
from outbox_audit import audit


class QueueTests(unittest.TestCase):
    def test_transitions_and_audit(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(server,'DB',Path(tmp)/'planner.sqlite3'):
                server.init()
                with server.connect() as db:
                    for sid in ('S1','S2'):
                        db.execute('INSERT INTO sites(id,address,status,created_at,updated_at) VALUES (?,?,?,?,?)',
                                   (sid,'123 Sample Street','draft',server.now(),server.now()))
                        db.execute('INSERT INTO scenarios(id,site_id,name,created_at) VALUES (?,?,?,?)',
                                   ('C'+sid,sid,'Baseline',server.now()))
                    report=server.newreport(db,'S1')
                    db.execute('INSERT INTO orders(id,site_id,report_id,scenario_id,status,created_at) VALUES (?,?,?,?,?,?)',
                               ('ORDER1','S1',report['id'],'CS1','queued',server.now()))
                    db.commit()
                    self.assertEqual(len(server.engineering_queue(db)),1)
                    with self.assertRaises(ValueError):
                        server.transition_order(db,'S2','ORDER1','assigned','Engineer','Assigned to review')
                    with self.assertRaises(ValueError):
                        server.transition_order(db,'S1','ORDER1','approved','Engineer','No review performed')
                    with self.assertRaises(ValueError):
                        server.transition_order(db,'S1','ORDER1','assigned','Engineer','')
                    self.assertEqual(server.transition_order(db,'S1','ORDER1','assigned','Engineer','Capacity review')['status'],'assigned')
                    server.transition_order(db,'S1','ORDER1','in_review','Engineer','Reviewing evidence')
                    server.transition_order(db,'S1','ORDER1','returned','Engineer','Preliminary drawing returned')
                    server.transition_order(db,'S1','ORDER1','approved','Owner','Reviewed scope and limitations')
                    with self.assertRaises(ValueError):
                        server.transition_order(db,'S1','ORDER1','assigned','Engineer','Reopening without process')
                    db.commit()
                    actions=db.execute('SELECT * FROM engineering_actions WHERE order_id=?',('ORDER1',)).fetchall()
                    self.assertEqual(len(actions),4)
                    self.assertEqual(len(server.engineering_queue(db,'approved')),1)
                    self.assertEqual(len(server.engineering_queue(db,'queued')),0)
                result=audit(server.DB)
                self.assertTrue(result['ok'],result['problems'])
                self.assertEqual(result['total_events'],4)

if __name__=='__main__':unittest.main()
