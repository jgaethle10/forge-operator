"""Real loopback HTTP checks: report lineage, queue transitions and source uploads."""
import json
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from http.server import ThreadingHTTPServer
import server

class APIWorkflowTests(unittest.TestCase):
    def test_report_order_queue_and_evidence_upload(self):
        with tempfile.TemporaryDirectory() as temp:
            data=Path(temp)
            (data/'uploads').mkdir()
            with patch.object(server,'DB',data/'test.sqlite3'), patch.object(server,'UPLOADS',data/'uploads'), patch.object(server,'TOKEN',''):
                server.init()
                http=ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
                thread=threading.Thread(target=http.serve_forever,daemon=True)
                thread.start()
                base=f'http://127.0.0.1:{http.server_port}/api'
                def req(path, method='GET', payload=None, raw=False):
                    body=json.dumps(payload).encode() if payload is not None else None
                    request=Request(base+path,method=method,data=body,headers={'Content-Type':'application/json'} if body else {})
                    try:
                        with urlopen(request,timeout=4) as response:
                            content=response.read()
                            return response.status,content if raw else json.loads(content)
                    except HTTPError as err:
                        return err.code,json.loads(err.read())
                try:
                    code,a=req('/sites','POST',{'address':'100 Test Ave','name':'Property A'})
                    self.assertEqual(code,201)
                    _,b=req('/sites','POST',{'address':'200 Test Ave','name':'Property B'})
                    _,scenario=req(f'/sites/{a["id"]}/scenarios','POST',{'sc_name':'Two stations','chargers':2})
                    _,evidence=req(f'/sites/{a["id"]}/evidence','POST',{'category':'Utilities','status':'unverified','finding':'Service capacity unknown'})
                    _,order=req(f'/sites/{a["id"]}/orders','POST',{'scenario_id':scenario['id'],'scope':'Concept layout','requested_by':'Owner','order_kind':'internal_planning'})
                    _,report=req('/reports/'+order['report_id']+'/export')
                    self.assertEqual(report['evidence'][0]['id'],evidence['id'])
                    self.assertEqual(report['evidence'][0]['status'],'unverified')
                    code,_=req(f'/sites/{b["id"]}/plans','POST',{'order_id':order['id'],'plan_status':'preliminary'})
                    self.assertEqual(code,400)
                    code,_=req(f'/sites/{a["id"]}/orders/{order["id"]}/status','PUT',{'status':'approved','actor':'Owner','reason':'Bypass review'})
                    self.assertEqual(code,400)
                    code,assigned=req(f'/sites/{a["id"]}/orders/{order["id"]}/status','PUT',{'status':'assigned','actor':'Operator','reason':'Start review'})
                    self.assertEqual((code,assigned['status']),(200,'assigned'))
                    boundary='EvercraftTestBoundary'
                    payload=(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="utility.txt"\r\nContent-Type: text/plain\r\n\r\n').encode()+b'Utility evidence, not verified\n'+(f'\r\n--{boundary}--\r\n').encode()
                    request=Request(base+'/evidence/'+evidence['id']+'/file',data=payload,method='POST',headers={'Content-Type':'multipart/form-data; boundary='+boundary})
                    with urlopen(request,timeout=4) as response:
                        self.assertEqual(response.status,201)
                        self.assertEqual(json.load(response)['name'],'utility.txt')
                    code,uploaded=req('/files/'+evidence['id'],raw=True)
                    self.assertEqual(code,200)
                    self.assertEqual(uploaded,b'Utility evidence, not verified\n')
                    _,events=req('/outbox')
                    self.assertTrue(any(ev['event_type']=='site.plan.status_changed.v1' and ev['state']=='pending' for ev in events))
                finally:
                    http.shutdown()
                    http.server_close()
                    thread.join(timeout=4)

if __name__ == '__main__':
    unittest.main()
