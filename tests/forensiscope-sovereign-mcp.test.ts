import test from 'node:test';
import assert from 'node:assert/strict';
import {
  executeForensiScopeMcpRpc,
  forensiScopeToolList,
} from '../systemia/forensiscope/mcp.ts';

test('sovereign ForensiScope MCP exposes native AI file handoff metadata', () => {
  const tools:any[] = forensiScopeToolList();
  assert.deepEqual(tools.map((tool) => tool.name), [
    'get_forensiscope_capabilities',
    'analyze_attached_media',
  ]);
  const ingest = tools.find((tool) => tool.name === 'analyze_attached_media');
  assert.deepEqual(ingest?._meta?.['openai/fileParams'], ['file']);
  assert.equal(ingest?.annotations?.readOnlyHint, false);
  assert.deepEqual(ingest?.inputSchema?.required, ['file', 'rights_attested']);
  assert.deepEqual(ingest?.inputSchema?.properties?.file?.required, ['download_url', 'file_id']);
});

test('sovereign ForensiScope MCP initializes without Base44', async () => {
  const response:any = await executeForensiScopeMcpRpc({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'test', version: '1' },
    },
  });

  assert.equal(response.result.serverInfo.name, 'evercraft-forensiscope');
  assert.equal(response.result.serverInfo.version, '0.2.0');
  assert.match(response.result.instructions, /Sovereign Evercraft ForensiScope/i);
});

test('direct analysis fails closed before any download when rights are not attested', async () => {
  const response:any = await executeForensiScopeMcpRpc({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'analyze_attached_media',
      arguments: {
        file: {
          download_url: 'https://example.com/media.mp4',
          file_id: 'file-test',
          file_name: 'media.mp4',
        },
        rights_attested: false,
      },
    },
  });

  assert.equal(response.result.isError, true);
  assert.equal(response.result.structuredContent.ok, false);
  assert.equal(response.result.structuredContent.error, 'rights_attestation_required');
});

test('capability tool reports sovereign runtime and no Base44 dependency', async () => {
  const original = process.env.FORENSISCOPE_TRANSCRIBE_ENABLED;
  process.env.FORENSISCOPE_TRANSCRIBE_ENABLED = 'false';
  try {
    const response:any = await executeForensiScopeMcpRpc({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'get_forensiscope_capabilities', arguments: {} },
    });
    assert.equal(response.result.structuredContent.runtime, 'yard_evercraft_compute');
    assert.equal(response.result.structuredContent.base44_dependency, false);
    assert.equal(response.result.isError, false);
  } finally {
    if (original === undefined) delete process.env.FORENSISCOPE_TRANSCRIBE_ENABLED;
    else process.env.FORENSISCOPE_TRANSCRIBE_ENABLED = original;
  }
});
