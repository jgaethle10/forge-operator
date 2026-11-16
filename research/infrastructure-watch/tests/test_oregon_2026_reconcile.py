import importlib.util, json, unittest
from pathlib import Path
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('oregon_2026_reconcile',root/'scripts/oregon_2026_reconcile.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

def fixture():
    a=[]
    for i in range(8326):
        grade='G' if i<2470 else 'F' if i<7896 else 'P' if i<8325 else 'N'
        a.append({'BL01':41,'BID01':f'OR{i:05d}','BID02':'Example',
                  'BC12':grade,'BL05':44.5,'BL06':-122.3})
    return a

class OregonExceptionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):cls.valid=fixture()
    def test_preserves_one_unclassified_N(self):
        rows=m.normalize(self.valid)
        self.assertEqual(len(rows),8326)
        self.assertEqual(sum(x['condition_classified'] for x in rows),8325)
        self.assertEqual(sum(x['condition']=='N' for x in rows),1)
        self.assertFalse(any(x['current_imminent_danger_verified'] for x in rows))
    def test_rejects_wrong_state(self):
        a=list(self.valid);a[0]=dict(a[0],BL01=53)
        with self.assertRaisesRegex(ValueError,'Wrong state'):m.normalize(a)
    def test_rejects_duplicate_bridge_id(self):
        a=list(self.valid);a[0]=dict(a[0],BID01=a[1]['BID01'])
        with self.assertRaisesRegex(ValueError,'Duplicate bridge'):m.normalize(a)
    def test_rejects_extra_unclassified(self):
        a=list(self.valid);a[0]=dict(a[0],BC12='N')
        with self.assertRaisesRegex(ValueError,'do not reconcile'):m.normalize(a)
    def test_rejects_unknown_or_unexpected(self):
        a=list(self.valid);a[0]=dict(a[0],BC12='X')
        with self.assertRaisesRegex(ValueError,'Unexpected condition'):m.normalize(a)
    def test_rejects_drifted_total(self):
        with self.assertRaisesRegex(ValueError,'raw count'):m.normalize(self.valid[:-1])
    def test_rejects_wrong_source_bytes(self):
        from tempfile import TemporaryDirectory
        with TemporaryDirectory() as d:
            with self.assertRaisesRegex(ValueError,'changed'):
                m.process(json.dumps(self.valid).encode(),d)
    def test_bad_coordinate_is_preserved_but_not_plotted(self):
        a=list(self.valid);a[0]=dict(a[0],BL05=0,BL06=0)
        rows=m.normalize(a)
        self.assertEqual(rows[0]['coordinate_quality'],'review')
        self.assertIsNone(rows[0]['latitude'])
if __name__=='__main__': unittest.main()
