"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../../..");
const site = path.join(root, "public/humanfilter-beta");
const extension = path.join(root, "products/humanfilter/extension");
const manifest = JSON.parse(fs.readFileSync(path.join(extension, "manifest.json"), "utf8"));
const index = fs.readFileSync(path.join(site, "index.html"), "utf8");
const privacy = fs.readFileSync(path.join(site, "privacy.html"), "utf8");
const sourcePolicy = fs.readFileSync(path.join(root, "products/humanfilter/store/privacy-policy.md"), "utf8");

test("release homepage local links and images resolve to committed files", () => {
  const matches = [...index.matchAll(/(?:href|src)="([^"]+)"/g)];
  let downloads = 0;
  for (const [, href] of matches) {
    if (href.startsWith("#") || href === "./" || /^[a-z]+:/i.test(href)) continue;
    const target = path.resolve(site, href.split("#")[0].split("?")[0]);
    assert.ok(target.startsWith(site + path.sep), "link escapes site directory: " + href);
    assert.ok(fs.existsSync(target), "broken release link: " + href);
    if (href.endsWith(".zip")) {
      const buffer = fs.readFileSync(target);
      assert.ok(buffer.length > 5000, "download appears truncated: " + href);
      assert.equal(buffer.subarray(0, 2).toString("ascii"), "PK", "not a ZIP: " + href);
      downloads++;
    }
  }
  assert.ok(downloads >= 5, "expected desktop and browser beta packages");
});

test("all published extension privacy version references match the actual manifest", () => {
  const version = manifest.version;
  assert.match(index, new RegExp("VERSION " + version.replace(/\./g, "\\.")));
  assert.match(privacy, new RegExp("VERSION " + version.replace(/\./g, "\\.")));
  assert.match(sourcePolicy, new RegExp("version " + version.replace(/\./g, "\\.")));
});

test("the customer page discloses actual capabilities and mobile limitations", () => {
  assert.match(index, /Not an AI lie detector/i);
  assert.match(index, /does not install into iPhone, Android/i);
  assert.match(index, /Chrome Web Store review is not complete/i);
  assert.match(index, /Other browser builds are experimental/i);
  assert.match(index, /Show once/i);
});
