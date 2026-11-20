"""Commercial order requests must remain blocked until provider-specific verified checkout exists."""
import unittest
from test_workflow import WorkflowTest
from outbox_audit import audit
from pathlib import Path

class CommercialGateTests(WorkflowTest):
    def test_commercial_quote_is_not_paid_or_dispatchable(self):
        status,s=self.api('/sites','POST',{'name':'Commercial test','address':'500 Quote Ave'})
        self.assertEqual(status,201)
        _,sc=self.api(f'/sites/{s["id"]}/scenarios','POST',{'sc_name':'Two units','chargers':2})
        status,order=self.api(f'/sites/{s["id"]}/orders','POST',{
            'scenario_id':sc['id'],'scope':'Concept only','requested_by':'Owner',
            'pretend_provider_paid':True,'provider_receipt_ref':'stripe:checkout:fake'})
        self.assertEqual(status,201)
        _,detail=self.api('/sites/'+s['id'])
        self.assertEqual(detail['order_controls'][0]['lane'],'commercial_quote')
        self.assertEqual(detail['order_controls'][0]['payment_state'],'checkout_unconfigured')
        self.assertEqual(detail['order_controls'][0]['fulfillment_release_state'],'held')
        _,queue=self.api('/engineering/queue')
        matched=[x for x in queue if x['order_id']==order['id']][0]
        self.assertEqual(matched['payment_state'],'checkout_unconfigured')
        self.assertEqual(matched['fulfillment_release_state'],'held')
        code,err=self.api(f'/sites/{s["id"]}/orders/{order["id"]}/status','PUT',{
            'status':'assigned','actor':'Operator','reason':'Incorrectly mark paid'})
        self.assertEqual(code,400)
        self.assertIn('held',err['error'])
        code,_=self.api(f'/sites/{s["id"]}/plans','POST',{
            'order_id':order['id'],'plan_status':'preliminary','title':'Pretend finished'})
        self.assertEqual(code,400)
        _,freeze=self.api('/reports/'+order['report_id']+'/export')
        self.assertEqual(freeze['site']['id'],s['id'])
        _,readiness=self.api('/commercial/readiness')
        self.assertFalse(readiness['checkout_configured'])
        self.assertFalse(readiness['commercial_release_allowed'])
        _,events=self.api('/outbox')
        held=[e for e in events if e['aggregate_id']==order['id'] and e['event_type']=='site.plan.commercial_hold.v1']
        self.assertEqual(len(held),1)
        self.assertEqual(held[0]['state'],'pending')
        audited=audit(Path(self.temp.name)/'site-planner.sqlite3')
        self.assertTrue(audited['ok'],audited['problems'])
        code,cancel=self.api(f'/sites/{s["id"]}/orders/{order["id"]}/status','PUT',{
            'status':'cancelled','actor':'Operator','reason':'Quote not accepted'})
        self.assertEqual(code,200)
        self.assertEqual(cancel['status'],'cancelled')

    def test_invalid_intent_and_missing_legacy_clearance_fail_closed(self):
        _,site=self.api('/sites','POST',{'address':'501 Quote Ave'})
        _,sc=self.api(f'/sites/{site["id"]}/scenarios','POST',{'sc_name':'Base'})
        code,_=self.api(f'/sites/{site["id"]}/orders','POST',{'scenario_id':sc['id'],'order_kind':'paid'})
        self.assertEqual(code,400)
        _,detail=self.api('/sites/'+site['id'])
        self.assertFalse(detail['orders'])
        self.assertFalse(detail['reports'])

if __name__ == '__main__':unittest.main()
