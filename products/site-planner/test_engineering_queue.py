"""v1.3 engineering queue: allowed transitions, tenant isolation, durable lineage."""
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import server
from outbox_audit import audit


class EngineeringQueueTests(unittest.TestCase):
    def test_lifecycle_and_rejection(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(server, "DB", Path(tmp) / "test.sqlite3"):
                server.init()
                with server.connect() as db:
                    for site_id in ("S1", "S2"):
                        db.execute(
                            "INSERT INTO sites(id,address,status,created_at,updated_at) VALUES (?,?,?,?,?)",
                            (site_id, "100 Test St", "draft", server.now(), server.now()))
                        db.execute(
                            "INSERT INTO scenarios(id,site_id,name,created_at) VALUES (?,?,?,?)",
                            ("SC" + site_id, site_id, "Baseline", server.now()))
                    report = server.newreport(db, "S1")
                    db.execute(
                        "INSERT INTO orders(id,site_id,report_id,scenario_id,status,created_at) VALUES (?,?,?,?,?,?)",
                        ("O1", "S1", report["id"], "SCS1", "queued", server.now()))
                    db.commit()
                    self.assertEqual(len(server.engineering_queue(db, "queued")), 1)

                    for site, state, actor, reason in (
                        ("S2", "assigned", "Engineer", "Wrong site"),
                        ("S1", "approved", "Engineer", "Skip review"),
                        ("S1", "assigned", "", "Missing actor"),
                        ("S1", "assigned", "Engineer", "")):
                        with self.assertRaises(ValueError):
                            server.transition_order(db, site, "O1", state, actor, reason)
                    self.assertEqual(db.execute("SELECT status FROM orders WHERE id='O1'").fetchone()[0], "queued")
                    self.assertEqual(db.execute("SELECT count(*) FROM outbox").fetchone()[0], 0)

                    for state in ("assigned", "in_review", "returned", "approved"):
                        record = server.transition_order(db, "S1", "O1", state, "Operator", "Recorded review step")
                        self.assertEqual(record["status"], state)
                    with self.assertRaises(ValueError):
                        server.transition_order(db, "S1", "O1", "assigned", "Operator", "Unapproved reopen")
                    db.commit()
                    self.assertEqual(db.execute("SELECT count(*) FROM engineering_actions").fetchone()[0], 4)
                    self.assertEqual(db.execute("SELECT count(*) FROM outbox").fetchone()[0], 4)
                result = audit(server.DB)
                self.assertTrue(result["ok"], result["problems"])

if __name__ == "__main__":
    unittest.main()
