"""Integration tests for report provenance, request ownership, and persistent records."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from urllib.request import Request, urlopen
from urllib.error import HTTPError

APP = Path(__file__).resolve().parent

class WorkflowTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='evercraft-site-test-')
        import socket
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            cls.port = sock.getsockname()[1]
        env = {**os.environ, 'EVERCRAFT_SITE_DATA': cls.temp.name,
               'EVERCRAFT_SITE_PORT': str(cls.port), 'EVERCRAFT_SITE_HOST': '127.0.0.1'}
        cls.proc = subprocess.Popen([sys.executable, str(APP/'server.py')], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(80):
            try:
                with urlopen(f'http://127.0.0.1:{cls.port}/api/health', timeout=0.2): break
            except Exception: time.sleep(0.05)
        else: raise AssertionError('Server did not start')

    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate()
        cls.proc.wait(timeout=5)
        cls.temp.cleanup()

    def api(self,path,method='GET',data=None):
        payload = json.dumps(data).encode() if data is not None else None
        req = Request(f'http://127.0.0.1:{self.port}/api{path}', data=payload,
                      method=method, headers={'Content-Type':'application/json'} if payload else {})
        try:
            with urlopen(req,timeout=4) as r:return r.status,json.load(r)
        except HTTPError as ex:return ex.code,json.load(ex)

    def test_plan_is_bound_to_origin_report_and_cross_site_rejected(self):
        _,a=self.api('/sites','POST',{'name':'Test A','address':'100 Example St, Yakima, WA'})
        _,b=self.api('/sites','POST',{'name':'Test B','address':'200 Example St, Yakima, WA'})
        sid=a['id']
        _,s=self.api(f'/sites/{sid}/scenarios','POST',{'sc_name':'Two chargers','chargers':2})
        _,e=self.api(f'/sites/{sid}/evidence','POST',{'category':'Utilities','status':'unverified','finding':'Service capacity unknown'})
        status,order=self.api(f'/sites/{sid}/orders','POST',{'scenario_id':s['id'],'scope':'Preliminary','requested_by':'Owner','order_kind':'internal_planning'})
        self.assertEqual(status,201)
        _,record=self.api(f'/sites/{sid}')
        self.assertEqual(record['reports'][0]['id'],order['report_id'])
        self.assertEqual(record['orders'][0]['scenario_id'],s['id'])
        _,plan=self.api(f'/sites/{sid}/plans','POST',{'order_id':order['id'],'plan_title':'First layout','plan_status':'preliminary'})
        self.assertEqual(plan['report_id'],order['report_id'])
        self.assertEqual(plan['site_id'],sid)
        status,bad=self.api(f'/sites/{b["id"]}/plans','POST',{'order_id':order['id'],'plan_status':'preliminary'})
        self.assertEqual(status,400)
        _,report=self.api('/reports/'+order['report_id']+'/export')
        self.assertEqual(report['site']['id'],sid)
        self.assertEqual(report['evidence'][0]['status'],'unverified')
        _,later=self.api(f'/sites/{sid}/evidence','POST',{'category':'Utilities','status':'verified','finding':'Later evidence'})
        _,frozen=self.api('/reports/'+order['report_id']+'/export')
        self.assertEqual(len(frozen['evidence']),1)
        self.assertEqual(frozen['evidence'][0]['id'],e['id'])
        _,events=self.api('/outbox')
        order_events=[x for x in events if x['aggregate_id']==order['id']]
        self.assertEqual(len(order_events),1)
        self.assertEqual(order_events[0]['event_type'],'site.plan.requested.v1')
        self.assertEqual(order_events[0]['state'],'pending')
        self.assertEqual(len(order_events[0]['payload_sha256']),64)
        plan_events=[x for x in events if x['aggregate_id']==plan['id']]
        self.assertEqual(len(plan_events),1)
        self.assertEqual(plan_events[0]['state'],'pending')
        self.assertIsNone(plan_events[0]['delivered_at'])

if __name__=='__main__':unittest.main()

class InputValidationTest(WorkflowTest):
    def test_required_and_invalid_fields_do_not_create_orders(self):
        status,_=self.api('/sites','POST',{'address':'  '})
        self.assertEqual(status,400)
        _,a=self.api('/sites','POST',{'name':'Validation A','address':'300 Example St'})
        _,b=self.api('/sites','POST',{'name':'Validation B','address':'400 Example St'})
        sid=a['id']
        for invalid in ({'sc_name':'Bad','chargers':-1},
                        {'sc_name':'Bad','chargers':1.5},
                        {'sc_name':'Bad','power':-12},
                        {'sc_name':'Bad','cost':-100}):
            status,_=self.api(f'/sites/{sid}/scenarios','POST',invalid)
            self.assertEqual(status,400)
        _,other=self.api(f'/sites/{b["id"]}/scenarios','POST',{'sc_name':'Other site','chargers':2})
        status,_=self.api(f'/sites/{sid}/orders','POST',{'scenario_id':other['id']})
        self.assertEqual(status,400)
        _,detail=self.api(f'/sites/{sid}')
        self.assertEqual(detail['orders'],[])
        self.assertEqual(detail['reports'],[])

    def test_report_snapshot_is_not_rewritten(self):
        _,site=self.api('/sites','POST',{'address':'500 Example St','name':'Original'})
        sid=site['id']
        _,r=self.api(f'/sites/{sid}/reports','POST',{})
        status,_=self.api(f'/sites/{sid}','PUT',{'name':'Changed'})
        self.assertEqual(status,200)
        _,frozen=self.api('/reports/'+r['id']+'/export')
        self.assertEqual(frozen['site']['name'],'Original')
