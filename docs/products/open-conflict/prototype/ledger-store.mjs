/**
 * Open Conflict v0.3: filesystem-backed ledger storage for trusted local operators.
 * No network listener, no automatic publication, no public endpoint.
 * Writes are atomic (temporary file + rename) and serialized per process.
 * This is NOT a multi-writer database or a substitute for off-host backups.
 */
import { readFile, writeFile, rename, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { EvidenceLedger } from "./evidence-ledger.mjs";

export class LedgerStore {
  #path;
  #queue = Promise.resolve();
  constructor(path) {
    if (typeof path !== "string" || !path.trim()) throw new TypeError("ledger path required");
    this.#path = resolve(path);
  }
  async read() {
    let raw;
    try { raw = await readFile(this.#path, "utf8"); }
    catch (error) {
      if (error.code === "ENOENT") return new EvidenceLedger();
      throw error;
    }
    const entries = JSON.parse(raw);
    return new EvidenceLedger(entries);
  }
  async append(change) {
    const operation = this.#queue.then(async () => {
      const ledger = await this.read();
      const entry = ledger.append(change);
      const directory = dirname(this.#path);
      await mkdir(directory, { recursive:true });
      const temporary = this.#path + "." + randomUUID() + ".tmp";
      try {
        await writeFile(temporary, JSON.stringify(ledger.entries(), null, 2) + "\n", {encoding:"utf8",flag:"wx",mode:0o600});
        await rename(temporary, this.#path);
      } finally {
        await rm(temporary, {force:true}).catch(()=>{});
      }
      return entry;
    });
    this.#queue = operation.catch(()=>{});
    return operation;
  }
}
