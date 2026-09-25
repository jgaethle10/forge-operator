import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function atomicWrite(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

export class FileCourier {
  constructor({ root }) {
    if (!root) throw new Error('courier_root_required');
    this.root = path.resolve(root);
    fs.mkdirSync(this.root, { recursive: true, mode: 0o700 });
  }

  exportEnvelope(envelope) {
    if (!envelope || envelope.schema !== 'evercraft.secure-envelope.v1') {
      throw new Error('secure_envelope_required');
    }
    const bytes = Buffer.from(JSON.stringify(envelope));
    const contentHash = sha256(bytes);
    const file = path.join(this.root, `${contentHash}.ecenv.json`);
    const existed = fs.existsSync(file);
    if (!existed) atomicWrite(file, bytes);

    return {
      schema: 'evercraft.file-courier-export.v1',
      message_id: envelope.message_id,
      content_hash: `sha256:${contentHash}`,
      file_name: path.basename(file),
      bytes: bytes.length,
      duplicate_export: existed,
      exported_at: new Date().toISOString()
    };
  }

  list() {
    return fs.readdirSync(this.root)
      .filter((name) => /^[a-f0-9]{64}\.ecenv\.json$/.test(name))
      .sort();
  }

  importEnvelopes() {
    const results = [];
    for (const name of this.list()) {
      const file = path.join(this.root, name);
      const bytes = fs.readFileSync(file);
      const expected = name.split('.')[0];
      const actual = sha256(bytes);
      if (actual !== expected) {
        results.push({
          file_name: name,
          status: 'CORRUPT_FILE',
          expected_hash: `sha256:${expected}`,
          actual_hash: `sha256:${actual}`
        });
        continue;
      }

      let envelope;
      try {
        envelope = JSON.parse(bytes.toString('utf8'));
      } catch {
        results.push({
          file_name: name,
          status: 'INVALID_JSON'
        });
        continue;
      }

      if (envelope.schema !== 'evercraft.secure-envelope.v1') {
        results.push({
          file_name: name,
          status: 'INVALID_ENVELOPE_SCHEMA'
        });
        continue;
      }

      results.push({
        file_name: name,
        status: 'READY',
        content_hash: `sha256:${actual}`,
        envelope
      });
    }
    return results;
  }

  acknowledge(fileName) {
    if (!/^[a-f0-9]{64}\.ecenv\.json$/.test(String(fileName || ''))) {
      throw new Error('invalid_courier_file_name');
    }
    const file = path.join(this.root, fileName);
    if (fs.existsSync(file)) fs.unlinkSync(file);
    return {
      schema: 'evercraft.file-courier-ack.v1',
      file_name: fileName,
      removed: !fs.existsSync(file),
      acknowledged_at: new Date().toISOString()
    };
  }
}
