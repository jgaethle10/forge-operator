#!/usr/bin/env node
import fs from "node:fs";

const input = process.argv[2];
if (!input) throw new Error("usage: zone-compiler.mjs <zone.json>");
const zone = JSON.parse(fs.readFileSync(input, "utf8"));
const fqdn = n => n === "@" ? zone.origin : n.endsWith(".") ? n : `${n}.${zone.origin}`;
const esc = v => String(v).replace(/"/g, '\\"');

if (!zone.origin?.endsWith(".")) throw new Error("origin must be an absolute DNS name ending in .");
if (!Number.isInteger(zone.serial)) throw new Error("serial must be an integer");
if (!zone.primary_ns || !zone.admin) throw new Error("primary_ns and admin are required");

const out = [];
out.push(`$ORIGIN ${zone.origin}`);
out.push(`$TTL ${zone.default_ttl ?? 300}`);
out.push(`@ IN SOA ${zone.primary_ns} ${zone.admin} (`);
out.push(`  ${zone.serial} 300 120 1209600 300 )`);
for (const ns of zone.nameservers ?? []) out.push(`@ IN NS ${ns}`);

for (const r of zone.records ?? []) {
  const name=fqdn(r.name);
  const ttl=r.ttl ?? zone.default_ttl ?? 300;
  const type=String(r.type).toUpperCase();
  if (!["A","AAAA","CNAME","TXT","MX","CAA","SRV","NS"].includes(type)) throw new Error(`unsupported RR type ${type}`);
  let value=r.value;
  if (type==="TXT") value=`"${esc(value)}"`;
  if (type==="MX") value=`${r.priority ?? 10} ${value}`;
  if (type==="SRV") value=`${r.priority ?? 0} ${r.weight ?? 0} ${r.port} ${value}`;
  if (type==="CAA") value=`${r.flags ?? 0} ${r.tag ?? "issue"} "${esc(value)}"`;
  out.push(`${name} ${ttl} IN ${type} ${value}`);
}
process.stdout.write(out.join("\n")+"\n");
