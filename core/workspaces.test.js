// The old layout (data/main, data/demo, data/<id>) moves once: data/ becomes the main workspace, others go beside it.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, before, test } from "node:test";

const ROOT = resolve(import.meta.dirname, "..");
const PORT = 3494;
const BASE = `http://localhost:${PORT}`;

const home = mkdtempSync(join(tmpdir(), "speys-local-"));
const data = join(home, "data");
let server;

before(async () => {
  mkdirSync(join(data, "main", "apps", "crm"), { recursive: true });
  writeFileSync(join(data, "main", "settings.json"), JSON.stringify({ crm: { note: "kept" } }));
  writeFileSync(join(data, "main", "apps", "crm", "veri.json"), "{}");
  mkdirSync(join(data, "demo"));
  mkdirSync(join(data, "client-work"));
  writeFileSync(join(data, "client-work", "settings.json"), "{}");
  writeFileSync(join(data, "workspace.json"), JSON.stringify({ active: "main" }));
  server = spawn(process.execPath, [join(ROOT, "start.js"), "--port", String(PORT), "--no-open"], {
    env: { ...process.env, HOME: home, USERPROFILE: home, SPEYS_LOCAL_HOME: data, CLAUDE_CONFIG_DIR: "" },
    stdio: "ignore",
  });
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`${BASE}/api/applets`);
      return;
    } catch {
      await new Promise((done) => setTimeout(done, 100));
    }
  }
  throw new Error("the server did not start");
});

after(() => {
  server?.kill();
  rmSync(home, { recursive: true, force: true });
});

test("the old folders move: data/ is main, the others sit beside it", async () => {
  assert.equal(JSON.parse(readFileSync(join(data, "settings.json"), "utf8")).crm.note, "kept");
  assert.ok(existsSync(join(data, "apps", "crm", "veri.json")));
  assert.ok(existsSync(join(data, "workspace.json")));
  assert.ok(!existsSync(join(data, "main")));
  assert.ok(existsSync(join(home, "data.demo")) && existsSync(join(home, "data.client-work", "settings.json")));
  assert.deepEqual((await (await fetch(`${BASE}/api/workspaces`)).json()).list, ["main", "demo", "client-work"]);
});

test("a new workspace is a folder beside data/", async () => {
  const post = (body) => fetch(`${BASE}/api/workspaces`, { method: "POST", headers: { "X-Panel": "1", "Content-Type": "application/json" }, body: JSON.stringify(body) });
  assert.equal((await post({ create: "Side Project" })).status, 200);
  assert.ok(existsSync(join(home, "data.side-project")));
  assert.equal((await post({ id: "main" })).status, 200);
});
