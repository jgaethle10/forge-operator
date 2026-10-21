import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const recoveryDir = path.resolve(scriptDir, "../systemia/migrations/drive-recovery");
const inventoryPath = path.join(recoveryDir, "inventory.json");
const estatePath = path.resolve(scriptDir, "../systemia/migrations/base44-exit/estate-snapshot.json");

const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
const estate = JSON.parse(fs.readFileSync(estatePath, "utf8"));

if (inventory.schema !== "evercraft.systemia.drive-recovery-inventory.v1") {
  throw new Error("Unexpected Drive recovery inventory schema");
}

const forbidden = [
  /drive\.google\.com/i,
  /docs\.google\.com/i,
  /base44\.app\/api\/apps\/[a-z0-9_-]+/i,
  /(?:api[_-]?key|secret|password|token)\s*[:=]/i
];

function assertSafe(label, value) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  for (const pattern of forbidden) {
    if (pattern.test(serialized)) {
      throw new Error(`${label} contains forbidden private locator or secret-like material: ${pattern}`);
    }
  }
}

assertSafe("Drive recovery inventory", inventory);

const products = new Set();
const queued = new Set(estate.queue.map((item) => item.product));
let linkedContracts = 0;

for (const item of inventory.items ?? []) {
  if (!item.product || !Array.isArray(item.evidence) || item.evidence.length === 0) {
    throw new Error("Every Drive recovery item needs a product and evidence");
  }
  if (products.has(item.product)) {
    throw new Error(`Duplicate Drive recovery product: ${item.product}`);
  }
  products.add(item.product);

  if (!queued.has(item.product)) {
    throw new Error(`Drive recovery product is not admitted to the migration queue: ${item.product}`);
  }

  if (item.recovered_contract) {
    const contractPath = path.resolve(recoveryDir, item.recovered_contract);
    if (!contractPath.startsWith(recoveryDir + path.sep)) {
      throw new Error(`Recovered contract escapes recovery directory: ${item.recovered_contract}`);
    }
    if (!fs.existsSync(contractPath)) {
      throw new Error(`Recovered contract does not exist: ${item.recovered_contract}`);
    }

    const raw = fs.readFileSync(contractPath, "utf8");
    assertSafe(`Recovered contract ${item.recovered_contract}`, raw);

    const contract = JSON.parse(raw);
    if (contract.schema !== "evercraft.systemia.drive-recovery-slice.v1") {
      throw new Error(`Unexpected recovery slice schema: ${item.recovered_contract}`);
    }
    if (contract.product !== item.product) {
      throw new Error(`Recovery slice product mismatch for ${item.product}`);
    }
    linkedContracts += 1;
  }
}

console.log(
  `Drive recovery inventory valid: ${products.size} products mapped to the migration queue; ${linkedContracts} recovered contracts linked and safety-scanned.`
);
