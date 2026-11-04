import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { Script } from "node:vm";

const ROOT = join(import.meta.dirname, "..");
const pages = [
  ...readdirSync(join(ROOT, "core")).filter((f) => f.endsWith(".html")).map((f) => join("core", f)),
  ...readdirSync(join(ROOT, "applets", "store")).map((id) => join("applets", "store", id, "index.html"))
    .filter((f) => statSync(join(ROOT, f), { throwIfNoEntry: false })?.isFile()),
];

for (const page of pages) {
  test(`${page}: its scripts parse`, () => {
    const scripts = [...readFileSync(join(ROOT, page), "utf8").matchAll(/<script>([\s\S]*?)<\/script>/g)];
    for (const [, code] of scripts) assert.doesNotThrow(() => new Script(code, { filename: page }));
  });
}
