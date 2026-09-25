import fs from "node:fs";

const inventoryPath = new URL("../systemia/migrations/drive-recovery/inventory.json", import.meta.url);
const estatePath = new URL("../systemia/migrations/base44-exit/estate-snapshot.json", import.meta.url);

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

const serialized = JSON.stringify(inventory);
for (const pattern of forbidden) {
  if (pattern.test(serialized)) {
    throw new Error(`Drive recovery inventory contains forbidden private locator or secret-like material: ${pattern}`);
  }
}

const products = new Set();
const queued = new Set(estate.queue.map((item) => item.product));

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
}

console.log(`Drive recovery inventory valid: ${products.size} products mapped to the migration queue.`);
