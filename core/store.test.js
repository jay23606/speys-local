// Every Store applet's applet.json is valid and its pictures are found; a workspace starts with the right installed list.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";
import { LEGACY, manifestProblem, screenshotFile, screenshots, startingInstalled } from "./store.js";

const ROOT = resolve(import.meta.dirname, "..");
const STORE = join(ROOT, "applets", "store");
const dir = mkdtempSync(join(tmpdir(), "speys-store-"));
after(() => rmSync(dir, { recursive: true, force: true }));

const ids = readdirSync(STORE).filter((id) => statSync(join(STORE, id)).isDirectory());

test("every Store applet has a valid applet.json, an icon and a lowercase id", () => {
  for (const id of ids) {
    const a = JSON.parse(readFileSync(join(STORE, id, "applet.json"), "utf8"));
    assert.equal(manifestProblem(a), null, id);
    assert.match(id, /^[a-z0-9][a-z0-9-]{0,40}$/);
    assert.ok(a.icon && statSync(join(STORE, id, a.icon)).isFile(), id);
  }
});

test("the applets that came before the Store are all still in it", () => {
  for (const id of LEGACY) assert.ok(ids.includes(id), id);
});

test("applet.json fields for the Store are checked", () => {
  const ok = { name: "Notes", description: "Notes." };
  assert.equal(manifestProblem({ ...ok, category: "Games", reads: "Its own data", platforms: ["macos"], preinstalled: true }), null);
  assert.match(manifestProblem({ name: "Notes" }), /description/);
  assert.match(manifestProblem({ ...ok, category: "" }), /category/);
  assert.match(manifestProblem({ ...ok, platforms: ["amiga"] }), /platforms/);
  assert.match(manifestProblem({ ...ok, preinstalled: "yes" }), /preinstalled/);
  assert.match(manifestProblem({ ...ok, url: "https://evil.example" }), /url/);
});

test("screenshots are the applet's PNGs in name order, and nothing else is served", () => {
  const folder = join(dir, "notes");
  mkdirSync(join(folder, "screenshots"), { recursive: true });
  for (const f of ["2.png", "1.png", "notes.txt"]) writeFileSync(join(folder, "screenshots", f), "x");
  writeFileSync(join(folder, "applet.json"), "{}");
  assert.deepEqual(screenshots(folder), ["1.png", "2.png"]);
  assert.deepEqual(screenshots(join(dir, "none")), []);
  assert.equal(screenshotFile(folder, "1.png"), join(folder, "screenshots", "1.png"));
  for (const name of ["notes.txt", "../applet.json", "3.png", undefined]) assert.equal(screenshotFile(folder, name), null);
});

test("a new workspace gets the preinstalled applets; one in use keeps what it had, minus what was turned off", () => {
  const store = [{ id: "today", preinstalled: true }, { id: "crm" }, { id: "tasks", preinstalled: true }, { id: "sts2" }];
  assert.deepEqual(startingInstalled(store, { inUse: false }), ["today", "tasks"]);
  assert.deepEqual(startingInstalled(store, { inUse: true, disabled: ["crm"] }), ["tasks", "today"]);
  assert.deepEqual(startingInstalled(store, { inUse: true }), ["crm", "tasks", "today"]);
});
