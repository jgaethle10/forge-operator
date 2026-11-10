import importlib.util, json, tempfile, unittest
from pathlib import Path
MOD=Path(__file__).resolve().parents[1]/'scripts/fhwa_2026.py'
s=importlib.util.spec_from_file_location('fhwa_2026',MOD);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)

class FHWA2026Tests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.pinned=m.load_pinned_counts(Path(__file__).resolve().parents[1]/'fhwa_state_inventory_counts_2025_2026.csv')
    def test_all_pinned_counts_match_national(self):
        self.assertEqual(len(m.FIPS),53)
        self.assertEqual(sum(self.pinned.values()),624939)
    def fake_index(self,dup=False):
        items=[]
        for name,fips in m.FIPS.items():
            uri=f'2026/JSON/{"01" if dup and name=="Alaska" else fips}26.json'
            items.append(f'<tr><td>{name}</td><td>{self.pinned[name]:,}</td><td><a href="{uri}">JSON</a></td></tr>')
        return '<html><table>'+''.join(items)+'</table></html>'
    def test_parse_official_index(self):
        p=m.parse_official_index(self.fake_index())
        self.assertEqual(p['Washington']['count'],8619)
        self.assertEqual(p['U.S. Virgin Islands']['fips'],'78')
    def test_duplicate_download_url_rejected(self):
        with self.assertRaisesRegex(ValueError,'duplicate state download links'):
            m.parse_official_index(self.fake_index(dup=True))
    def test_wrong_count_rejected(self):
        with self.assertRaisesRegex(ValueError,'national count mismatch'):
            m.parse_official_index(self.fake_index().replace('8,619','8,620'))
    def sample(self):
        return [{'BL01':78,'BID01':'A','BID02':'Bridge One','BL05':17.75,'BL06':-64.7,'BC12':'P'},
                {'BL01':78,'BID01':'B','BID02':'Bridge Two','BL05':17.8,'BL06':-64.8,'BC12':'X'}]
    def test_condition_unknown_and_danger_false(self):
        rr=m.normalize_state(self.sample(),'U.S. Virgin Islands',2)
        self.assertEqual([x['condition'] for x in rr],['P','U'])
        self.assertFalse(any(x['current_danger_verified'] for x in rr))
    def test_reject_wrong_state_and_duplicate_id(self):
        d=self.sample();d[1]['BL01']=53
        with self.assertRaisesRegex(ValueError,'belongs to state'):m.normalize_state(d,'U.S. Virgin Islands',2)
        d=self.sample();d[1]['BID01']='A'
        with self.assertRaisesRegex(ValueError,'duplicate'):m.normalize_state(d,'U.S. Virgin Islands',2)
    def test_reject_count_mismatch(self):
        with self.assertRaisesRegex(ValueError,'count differs'):m.normalize_state(self.sample(),'U.S. Virgin Islands',23)
    def test_atomic_import_preserves_old_good_on_bad_update(self):
        info={'fips':'78','count':2,'url':m.PREFIX+'VI26.json'}
        p=m.import_one(self.root,'U.S. Virgin Islands',info,lambda url:json.dumps(self.sample()).encode())
        record,_=m.state_paths(self.root,'78');before=record.read_bytes()
        bad=self.sample();bad[0]['BL01']=53
        with self.assertRaisesRegex(ValueError,'belongs to state'):
            m.import_one(self.root,'U.S. Virgin Islands',info,lambda url:json.dumps(bad).encode())
        self.assertEqual(record.read_bytes(),before)
        self.assertTrue(json.loads(p.read_text())['verified'])
    def test_receipt_tamper_rejected(self):
        info={'fips':'78','count':2,'url':m.PREFIX+'VI26.json'}
        m.import_one(self.root,'U.S. Virgin Islands',info,lambda url:json.dumps(self.sample()).encode())
        d=dict(self.pinned);d['U.S. Virgin Islands']=2
        self.assertEqual(len(m.validate_receipts(self.root,d)),1)
        rec,_=m.state_paths(self.root,'78');rec.write_text('tamper\n')
        with self.assertRaisesRegex(ValueError,'receipt failed verification'):m.validate_receipts(self.root,d)
    def test_partial_index_is_clearly_partial_and_queryable(self):
        info={'fips':'78','count':2,'url':m.PREFIX+'VI26.json'}
        m.import_one(self.root,'U.S. Virgin Islands',info,lambda url:json.dumps(self.sample()).encode())
        d=dict(self.pinned);d['U.S. Virgin Islands']=2
        data=m.build_index(self.root,self.root/'index.sqlite',d)
        self.assertTrue(data['partial']);self.assertFalse(data['complete_national_import']);self.assertEqual(data['records'],2)
        q=m.query(self.root/'index.sqlite','78',20)
        self.assertEqual(q['returned'],2);self.assertTrue(q['partial'])
    def test_failed_rebuild_does_not_replace_index(self):
        info={'fips':'78','count':2,'url':m.PREFIX+'VI26.json'}
        m.import_one(self.root,'U.S. Virgin Islands',info,lambda url:json.dumps(self.sample()).encode())
        d=dict(self.pinned);d['U.S. Virgin Islands']=2
        db=self.root/'index.sqlite';m.build_index(self.root,db,d)
        before=db.read_bytes();p,_=m.state_paths(self.root,'78');p.write_text('bad\n')
        with self.assertRaises(ValueError):m.build_index(self.root,db,d)
        self.assertEqual(db.read_bytes(),before)
if __name__=='__main__':unittest.main()
