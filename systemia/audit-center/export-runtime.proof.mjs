#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { DurableEntityStore } from '../app-fabric/entity-store.mjs';
import { EvercraftSecretStore } from '../secret-store/secret-store.mjs';
import { EvercraftObjectStore } from '../object-store/object-store.mjs';
import { startObjectDeliveryGateway } from '../object-store/delivery-gateway.mjs';
import { EvercraftAuditExportRuntime } from './export-runtime.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-audit-export-proof-'));
let now=new Date('2026-10-01T15:00:00.000Z');
const signingKey='object-delivery-proof-signing-key-0000000000000001';

try{
  const secrets=new EvercraftSecretStore({
    stateDir:path.join(root,'secrets'),
    masterKey:randomBytes(32)
  });
  secrets.setSecret('object-delivery:audit','signing-key',signingKey);

  const entities=new DurableEntityStore({
    stateDir:path.join(root,'entities')
  });
  const objects=new EvercraftObjectStore({
    stateDir:path.join(root,'objects')
  });
  const delivery=await startObjectDeliveryGateway({
    objectStore:objects,
    signingKeyProvider:async()=>secrets.getSecretText('object-delivery:audit','signing-key'),
    allowLoopbackProof:true,
    clock:()=>now
  });

  try{
    const client=entities.create('systemia-audit-center','Client',{
      id:'client-proof',
      business_name:'Proof Company'
    }).record;
    const site=entities.create('systemia-audit-center','Site',{
      id:'site-proof',
      domain:'example.com'
    }).record;
    entities.create('systemia-audit-center','Audit',{
      id:'audit-proof',
      client_id:client.id,
      site_id:site.id,
      scope:'Website conversion and technical audit',
      overall_score:63
    });
    entities.create('systemia-audit-center','Report',{
      id:'report-proof',
      audit_id:'audit-proof',
      exec_summary:'<p>Executive <strong>proof</strong> summary.</p>',
      offer_ladder:'<p>Prioritize the highest-impact fixes first.</p>'
    });
    entities.create('systemia-audit-center','Finding',{
      id:'finding-low',
      audit_id:'audit-proof',
      title:'Low issue',
      severity:'Low',
      recommended_fix:'Later.'
    });
    entities.create('systemia-audit-center','Finding',{
      id:'finding-critical',
      audit_id:'audit-proof',
      title:'Critical issue',
      severity:'Critical',
      recommended_fix:'Fix now.'
    });
    entities.create('systemia-audit-center','FixTask',{
      id:'task-p2',
      audit_id:'audit-proof',
      task:'Later task',
      priority:'P2',
      estimate_hours:3
    });
    entities.create('systemia-audit-center','FixTask',{
      id:'task-p0',
      audit_id:'audit-proof',
      task:'Immediate task',
      priority:'P0',
      estimate_hours:1
    });

    let renderedModel=null;
    const runtime=new EvercraftAuditExportRuntime({
      entityStore:entities,
      objectStore:objects,
      objectDelivery:delivery,
      authorize:async({subjectRef,auditId})=>
        subjectRef==='proof-subject'&&auditId==='audit-proof',
      renderPdf:async(model)=>{
        renderedModel=model;
        return Buffer.from('%PDF-1.7\nEvercraft synthetic audit proof\n%%EOF');
      },
      clock:()=>now
    });

    await assert.rejects(
      ()=>runtime.exportAudit({auditId:'audit-proof',subjectRef:'wrong-subject'}),
      /audit_export_unauthorized/
    );

    const exported=await runtime.exportAudit({
      auditId:'audit-proof',
      subjectRef:'proof-subject'
    });
    assert.equal(exported.ok,true);
    assert.match(exported.blob_sha256,/^sha256:[a-f0-9]{64}$/);
    assert.equal(exported.source_platform_dependency,false);
    assert.equal(new URL(exported.file_url).hostname,'127.0.0.1');
    assert.equal(exported.file_url.includes('base44.app'),false);

    assert.equal(renderedModel.schema,'evercraft.audit-center.export-model.v1');
    assert.equal(renderedModel.executive_summary,'Executive proof summary.');
    assert.equal(renderedModel.findings[0].severity,'Critical');
    assert.equal(renderedModel.patch_plan[0].priority,'P0');

    const response=await fetch(exported.file_url);
    assert.equal(response.status,200);
    assert.equal(response.headers.get('content-type'),'application/pdf');
    assert.equal(response.headers.get('x-evercraft-object-sha256'),exported.blob_sha256);
    const bytes=Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.subarray(0,5).toString('ascii'),'%PDF-');

    const report=entities.get('systemia-audit-center','Report','report-proof');
    assert.equal(report.exported_pdf_object_ref,exported.object_ref);
    assert.equal(report.exported_pdf_sha256,exported.blob_sha256);
    assert.equal(report.exported_pdf,exported.file_url);

    const tampered=new URL(exported.file_url);
    tampered.searchParams.set('sig','00'.repeat(32));
    assert.equal((await fetch(tampered)).status,403);

    const short=await delivery.issueReadUrl('systemia-audit-center',exported.object_ref,{ttlSeconds:30});
    now=new Date('2026-10-01T15:01:00.000Z');
    assert.equal((await fetch(short)).status,403);

    const disk=fs.readFileSync(path.join(root,'secrets','secrets.json'),'utf8');
    assert.equal(disk.includes(signingKey),false);

    console.log(JSON.stringify({
      schema:'evercraft.audit-center.export-runtime-proof.v1',
      status:'pass',
      authenticated_export_required:true,
      report_model_preserved:true,
      findings_priority_preserved:true,
      object_content_addressed:true,
      signed_owned_delivery_url:true,
      tampered_url_rejected:true,
      expired_url_rejected:true,
      signing_key_encrypted_at_rest:true,
      raw_filesystem_path_exposed:false,
      base44_upload_dependency:false
    }));
  }finally{
    await delivery.close();
  }
}finally{
  fs.rmSync(root,{recursive:true,force:true});
}
