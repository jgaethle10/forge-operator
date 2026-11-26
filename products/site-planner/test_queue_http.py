"""Exercise the actual queue HTTP endpoints on an isolated server."""
from test_workflow import WorkflowTest

class QueueHTTPTest(WorkflowTest):
    def test_queue_http_transition(self):
        status,s=self.api('/sites','POST',{'address':'100 Queue Drive','name':'Queue test'})
        self.assertEqual(status,201)
        _,sc=self.api(f'/sites/{s["id"]}/scenarios','POST',{'sc_name':'EV baseline','chargers':2})
        _,order=self.api(f'/sites/{s["id"]}/orders','POST',{'scenario_id':sc['id'],'scope':'Preliminary EV plan','requested_by':'Owner','order_kind':'internal_planning'})
        code,queue=self.api('/engineering/queue')
        self.assertEqual(code,200)
        self.assertTrue(any(x['order_id']==order['id'] and x['status']=='queued' for x in queue))
        code,assigned=self.api(f'/sites/{s["id"]}/orders/{order["id"]}/status','PUT',
            {'status':'assigned','actor':'Operator','reason':'Evidence ready for review'})
        self.assertEqual(code,200)
        self.assertEqual(assigned['status'],'assigned')
        code,_=self.api(f'/sites/{s["id"]}/orders/{order["id"]}/status','PUT',
            {'status':'approved','actor':'Operator','reason':'Bypass review'})
        self.assertEqual(code,400)
        _,events=self.api('/outbox')
        self.assertTrue(any(e['event_type']=='site.plan.status_changed.v1' and e['aggregate_id']==order['id'] for e in events))
